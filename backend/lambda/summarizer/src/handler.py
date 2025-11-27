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
        FilterExpression=Attr('summary_last_updated').eq(None) | 
                        Attr('last_major_update').gt(Attr('summary_last_updated'))
    )

    items_to_process.extend(response['Items'])
    
    while 'LastEvaluatedKey' in response:
        response = posts_table.scan(
            FilterExpression=Attr('summary_last_updated').eq(None) | 
                            Attr('last_major_update').gt(Attr('summary_last_updated')),
            ExclusiveStartKey=response['LastEvaluatedKey']
        )
        response = posts_table.scan(ExclusiveStartKey=response['LastEvaluatedKey'])
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
    
    current_time = datetime.now(ZoneInfo("America/Los_Angeles"))
    
    last_summary_time = post.get('summary_last_updated')
    
    if last_summary_time is None:
        last_summary_time = '1970-01-01T00:00:00Z'
    
    diffs_response = diffs_table.query(
        KeyConditionExpression='#pk = :pk AND #ts > :last',
        ExpressionAttributeNames={
            '#pk': 'course_id#post_id',
            '#ts': 'timestamp'
        },
        ExpressionAttributeValues={
            ':pk': pk,
            ':last': last_summary_time
        }
    )
    
    if not diffs_response['Items']:
        return

    events_text = format_diffs(diffs_response['Items'])
    post_title = post.get('post_title', 'Untitled')
    
    if post.get('needs_new_summary', False):
        # fresh summary (ignore previous history)
        prompt_content = (
            f"Post Title: {post_title}\n"
            f"Content & Updates:\n{events_text}\n\n"
            "Task: Create a concise summary of this post."
        )
    else:
        # incremental update (merge history with current update)
        current = post.get('current_summary', 'No summary available.')
        prompt_content = (
            f"Current Summary: {current}\n\n"
            f"New Updates to Post:\n{events_text}\n\n"
            "Task: Update the Current Summary to reflect the New Updates. "
        )

    summary = call_openai(prompt_content)

    posts_table.update_item(
        Key={
            'course_id': post['course_id'],
            'post_id': post['post_id']
        },
        UpdateExpression='SET current_summary = :s, summary_last_updated = :t, needs_new_summary = :f',
        ExpressionAttributeValues={
            ':s': summary,
            ':t': str(current_time),
            ':f': False
        }
    )
    print(f"[SUCCESS] Summarized {pk}")

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
        "4. FORMATTING: Max 2 sentences. No bullet points."
    )

    response = open_ai_client.responses.create(
        model="gpt-5-mini",
        reasoning={"effort": "minimal"},
        instructions=system_instructions,
        input=prompt_input
    )
        
    return response.output[1].content[0].text