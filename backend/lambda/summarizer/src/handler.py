import concurrent.futures
from utils.constants import POSTS_TABLE_NAME, DIFFS_TABLE_NAME
from utils.clients import openai, dynamo
from boto3.dynamodb.conditions import Attr
from datetime import datetime
from zoneinfo import ZoneInfo

dynamodb = dynamo()
posts_table = dynamodb.Table(POSTS_TABLE_NAME)
diffs_table = dynamodb.Table(DIFFS_TABLE_NAME)
open_ai_client = openai()

# how many posts we process at the exact same time.
MAX_WORKERS = 10 

def lambda_handler(event, context):
    items_to_process = []
    
    response = posts_table.scan(
        FilterExpression=Attr('last_major_update').gt(Attr('summary_last_updated'))
    )

    items_to_process.extend(response['Items'])
    
    while 'LastEvaluatedKey' in response:
        response = posts_table.scan(
            FilterExpression=Attr('last_major_update').gt(Attr('summary_last_updated')),
            ExclusiveStartKey=response['LastEvaluatedKey']
        )
        items_to_process.extend(response['Items'])

    print(f"Found {len(items_to_process)} posts to summarize.")

    if not items_to_process:
        return {'statusCode': 200, 'body': 'No posts to update.'}

    # dispatch tasks to a thread pool
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_post = {executor.submit(summarize_post, post): post for post in items_to_process}
        
        # process results as they complete
        for future in concurrent.futures.as_completed(future_to_post):
            post = future_to_post[future]
            try:
                future.result()
                results.append(f"Success: {post.get('post_id')}")
            except Exception as e:
                print(f"[ERROR] Thread failed for {post.get('course_id')}#{post.get('post_id')}: {e}")
                results.append(f"Failed: {post.get('post_id')}")

    return {'statusCode': 200, 'body': f'Processed {len(items_to_process)} posts. Results: {len(results)} completed.'}


def summarize_post(post):
    pk = f"{post['course_id']}#{post['post_id']}"
    
    la_tz = ZoneInfo("America/Los_Angeles")
    current_time = datetime.now(la_tz)
    
    last_summarized_raw = post.get('summary_last_updated')
    
    if last_summarized_raw:
        query_time_limit = last_summarized_raw
    else:
        query_time_limit = '1970-01-01T00:00:00Z'

    # get all diffs that have happened since the last time it was summarized
    diffs_response = diffs_table.query(
        KeyConditionExpression='#pk = :pk AND #ts > :last',
        ExpressionAttributeNames={'#pk': 'course_id#post_id', '#ts': 'timestamp'},
        ExpressionAttributeValues={':pk': pk, ':last': query_time_limit}
    )
    
    if not diffs_response['Items']:
        return

    events_text = format_diffs(diffs_response['Items'])
    post_title = post.get('post_title', 'Untitled')
    current_summary = post.get('current_summary', 'No summary available.')

    is_fresh_start = needs_fresh_summary(post, current_time)

    if is_fresh_start:
        print(f"{post['post_id']} is getting a fresh start!")
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

    posts_table.update_item(
        Key={'course_id': post['course_id'], 'post_id': post['post_id']},
        UpdateExpression='SET current_summary = :s, summary_last_updated = :t, needs_new_summary = :f',
        ExpressionAttributeValues={
            ':s': summary,
            ':t': str(current_time),
            ':f': False
        }
    )
    print(f"[SUCCESS] Summarized {pk}")

def needs_fresh_summary(post, current_time):
    needs_new = post.get('needs_new_summary', False)
    last_summarized_str = post.get('summary_last_updated')
    summarization_range = 2 # days
    
    # if never summarized, we can't have a fresh start because there's no start to begin with
    if not last_summarized_str or last_summarized_str < '2000-01-01T00:00:00Z':
        return False

    try:
        last_summarized_dt = datetime.fromisoformat(last_summarized_str)
        if last_summarized_dt.tzinfo is None:
            last_summarized_dt = last_summarized_dt.replace(tzinfo=ZoneInfo("America/Los_Angeles"))
            
        days_since_summary = (current_time - last_summarized_dt).days
        outside_of_range = days_since_summary > summarization_range
    except ValueError:
        return True

    return (needs_new or outside_of_range)

def format_diffs(diffs):
    formatted = []
    for diff in diffs:
        timestamp = diff['timestamp']
        diff_type = diff.get('type', 'update')
        subject = diff.get('subject', '')
        content = diff.get('content', '')
        
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
        input=prompt_input
    )
        
    return response.output[1].content[0].text