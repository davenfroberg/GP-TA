import concurrent.futures
from datetime import datetime
from zoneinfo import ZoneInfo

from aws_lambda_powertools.metrics import MetricUnit
from boto3.dynamodb.conditions import Attr
from utils.clients import dynamo, openai
from utils.constants import DIFFS_TABLE_NAME, POSTS_TABLE_NAME
from utils.logger import logger
from utils.metrics import metrics

dynamodb = dynamo()
posts_table = dynamodb.Table(POSTS_TABLE_NAME)
diffs_table = dynamodb.Table(DIFFS_TABLE_NAME)
open_ai_client = openai()

# how many posts we process at the exact same time.
MAX_WORKERS = 10


@logger.inject_lambda_context(log_event=True)
@metrics.log_metrics(capture_cold_start_metric=False)
def lambda_handler(event, context):
    items_to_process = []

    response = posts_table.scan(
        FilterExpression=Attr("last_major_update").gt(Attr("summary_last_updated"))
    )

    items_to_process.extend(response["Items"])

    while "LastEvaluatedKey" in response:
        response = posts_table.scan(
            FilterExpression=Attr("last_major_update").gt(Attr("summary_last_updated")),
            ExclusiveStartKey=response["LastEvaluatedKey"],
        )
        items_to_process.extend(response["Items"])

    total_posts = len(items_to_process)
    logger.info("Found posts requiring summarization", extra={"post_count": total_posts})

    metrics.add_metric(name="SummarizerRuns", unit=MetricUnit.Count, value=1)

    if not items_to_process:
        return {"statusCode": 200, "body": "No posts to update."}

    # dispatch tasks to a thread pool
    processed = 0
    failed = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_post = {executor.submit(summarize_post, post): post for post in items_to_process}

        # process results as they complete
        for future in concurrent.futures.as_completed(future_to_post):
            post = future_to_post[future]
            try:
                future.result()
                processed += 1
            except Exception:
                failed += 1
                metrics.add_metric(name="SummarizerFailures", unit=MetricUnit.Count, value=1)
                logger.exception(
                    "Summarization thread failed",
                    extra={"course_id": post.get("course_id"), "post_id": post.get("post_id")},
                )

    metrics.add_metric(name="SummarizerPostsProcessed", unit=MetricUnit.Count, value=processed)
    logger.info(
        "Summarization run completed",
        extra={"total_posts": total_posts, "processed_posts": processed, "failed_posts": failed},
    )
    return {
        "statusCode": 200,
        "body": f"Processed {total_posts} posts. Success: {processed}. Failed: {failed}.",
    }


def summarize_post(post):
    pk = f"{post['course_id']}#{post['post_id']}"

    # Store timestamps in UTC for consistency with Piazza dates
    current_time = datetime.now(ZoneInfo("UTC"))

    last_summarized_raw = post.get("summary_last_updated")

    if last_summarized_raw:
        # Normalize to UTC for consistent comparison (handles old LA timezone data)
        try:
            dt = datetime.fromisoformat(last_summarized_raw)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=ZoneInfo("UTC"))
            else:
                dt = dt.astimezone(ZoneInfo("UTC"))
            query_time_limit = dt.isoformat()
        except ValueError:
            # Fallback to raw value if parsing fails
            query_time_limit = last_summarized_raw
    else:
        query_time_limit = "1970-01-01T00:00:00+00:00"

    # get all diffs that have happened since the last time it was summarized
    diffs_response = diffs_table.query(
        KeyConditionExpression="#pk = :pk AND #ts > :last",
        ExpressionAttributeNames={"#pk": "course_id#post_id", "#ts": "timestamp"},
        ExpressionAttributeValues={":pk": pk, ":last": query_time_limit},
    )

    if not diffs_response["Items"]:
        logger.debug("No new diffs to summarize", extra={"post_key": pk})
        return

    events_text = format_diffs(diffs_response["Items"])
    post_title = post.get("post_title", "Untitled")
    current_summary = post.get("current_summary", "No summary available.")

    is_fresh_start = needs_fresh_summary(post, current_time)

    if is_fresh_start:
        logger.info("Generating fresh summary", extra={"post_key": pk})
        prompt_content = (
            f"Summary type: New Updates Report\n"
            f"Post Title: {post_title}\n"
            f"Context (Previously established facts): {current_summary}\n"
            f"--- END CONTEXT ---\n\n"
            f"Recent Updates (The only thing to summarize):\n{events_text}\n\n"
            "Task: Summarize ONLY the 'Recent Updates'. "
            "Use the 'Context' to understand what the updates are referring to, but DO NOT repeat the context in your output. "
            "If the updates are just replies, state who (student vs instructor) replied and the resolution."
        )
    else:
        prompt_content = (
            f"Summary type: Running Log Update\n"
            f"Post Title: {post_title}\n"
            f"Current Running Summary: {current_summary}\n\n"
            f"New Updates to append/merge:\n{events_text}\n\n"
            "Task: Update the 'Current Running Summary' to include the 'New Updates'. "
            "Keep the history intact but condense slightly if it gets too long."
        )

    summary = call_openai(prompt_content)

    # Normalize existing timestamps to UTC when updating (for backward compatibility)
    # This ensures future comparisons work correctly even with old LA timezone data
    update_expr = "SET current_summary = :s, summary_last_updated = :t, needs_new_summary = :f"
    expr_values = {":s": summary, ":t": current_time.isoformat(), ":f": False}

    # Also normalize last_major_update and last_updated if they exist and are in old format
    # This prevents comparison issues in DynamoDB FilterExpression
    last_major = post.get("last_major_update")
    last_updated_val = post.get("last_updated")

    if last_major:
        try:
            dt = datetime.fromisoformat(last_major)
            if dt.tzinfo and dt.tzinfo.utcoffset(dt).total_seconds() != 0:
                # Has timezone offset (not UTC), normalize to UTC
                dt_utc = dt.astimezone(ZoneInfo("UTC"))
                update_expr += ", last_major_update = :lm"
                expr_values[":lm"] = dt_utc.isoformat()
        except ValueError:
            pass  # Skip if can't parse

    if last_updated_val:
        try:
            dt = datetime.fromisoformat(last_updated_val)
            if dt.tzinfo and dt.tzinfo.utcoffset(dt).total_seconds() != 0:
                # Has timezone offset (not UTC), normalize to UTC
                dt_utc = dt.astimezone(ZoneInfo("UTC"))
                update_expr += ", last_updated = :lu"
                expr_values[":lu"] = dt_utc.isoformat()
        except ValueError:
            pass  # Skip if can't parse

    posts_table.update_item(
        Key={"course_id": post["course_id"], "post_id": post["post_id"]},
        UpdateExpression=update_expr,
        ExpressionAttributeValues=expr_values,
    )
    logger.info("Updated summary", extra={"post_key": pk})


def needs_fresh_summary(post, current_time):
    needs_new = post.get("needs_new_summary", False)
    last_summarized_str = post.get("summary_last_updated")
    summarization_range = 2  # days

    # if never summarized, we can't have a fresh start because there's no start to begin with
    if not last_summarized_str or last_summarized_str < "2000-01-01T00:00:00Z":
        return False

    try:
        last_summarized_dt = datetime.fromisoformat(last_summarized_str)
        if last_summarized_dt.tzinfo is None:
            # Assume UTC if no timezone info (for backward compatibility)
            last_summarized_dt = last_summarized_dt.replace(tzinfo=ZoneInfo("UTC"))
        else:
            # Ensure both timestamps are in UTC for comparison
            last_summarized_dt = last_summarized_dt.astimezone(ZoneInfo("UTC"))

        days_since_summary = (current_time - last_summarized_dt).days
        outside_of_range = days_since_summary > summarization_range
    except ValueError:
        return True

    return needs_new or outside_of_range


def format_diffs(diffs):
    formatted = []
    for diff in diffs:
        timestamp = diff["timestamp"]
        diff_type = diff.get("type", "update")
        subject = diff.get("subject", "")
        content = diff.get("content", "")

        formatted.append(f"[{timestamp}] {diff_type.upper()}")
        if subject:
            formatted.append(f"Subject: {subject}")
        if content:
            formatted.append(f"Content: {content[:500]}...")
        formatted.append("")

    return "\n".join(formatted)


def call_openai(prompt_input):
    system_instructions = (
        "You are a backend summarization engine for a technical course forum. "
        "Your output is for a 'Catch Me Up' dashboard. The user should know what's been happening on the forum.\n"
        "RULES:\n"
        "1. ATTRIBUTED BREVITY: Always identify the source of key info (e.g., 'Instructor confirmed...', 'Student reported issue with...').\n"
        "2. IF RESOLVED: State the solution clearly (e.g., 'Instructor clarified that only one screenshot is required').\n"
        "3. IF UNRESOLVED: Summarize the core question (e.g., 'Student asked for clarification on the deadline; no response yet.').\n"
        "4. FRESH SUMMARIES (CONTEXT USE): When provided with a 'Previous Summary' as context, do not repeat it. "
        "Summarize ONLY the 'New Updates', but use the context to anchor the topic (e.g., 'Instructor provided the missing screenshot,' rather than just 'Instructor posted an image').\n"
        "5. FORMATTING: Max 2 sentences. No bullet points."
    )

    response = open_ai_client.responses.create(
        model="gpt-5-mini",
        reasoning={"effort": "minimal"},
        instructions=system_instructions,
        input=prompt_input,
    )

    return response.output[1].content[0].text
