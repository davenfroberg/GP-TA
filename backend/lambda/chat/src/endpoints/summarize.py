import boto3
from datetime import datetime, timedelta, timezone
from utils.constants import CLASSES, POSTS_TABLE_NAME
from utils.utils import send_websocket_message
from utils.clients import openai, apigw
from typing import Dict
from enums.WebSocketType import WebSocketType

dynamodb = boto3.resource("dynamodb")
posts_table = dynamodb.Table(POSTS_TABLE_NAME)


def create_system_prompt() -> str:
    return """You are a helpful assistant that creates high-level digests of Piazza activity.

    When given post summaries, create a brief overview that tells the user WHAT topics are being discussed, not the detailed content. Your goal is to help them decide what to read, not replace reading the posts.

    Format your digest using markdown with this structure:

    ## Topic Category (number of posts)

    Brief 1-2 sentence description of activity.

    Examples:

    ## Homework 4 Submission (5 posts)

    Several students reporting GitHub upload issues; TA provided clarification on file requirements

    ## Examlet Logistics (3 posts)

    Questions about viewing appointments and format; instructor posted schedule and stats

    ## Proof Techniques (4 posts)

    Students asking about induction and quantifier usage; TA provided detailed examples

    Guidelines:
    - Keep it concise - aim for 3-7 topic sections total
    - Group related posts together under one topic
    - Highlight when instructors/TAs provided important responses
    - Use proper markdown formatting (##, **, etc.)
    - Do NOT use literal \\n or escaped characters - use actual line breaks
    - Be specific about what's being discussed, not generic"""


def get_recent_summaries(class_id: str, days: int = 2) -> list[dict]:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    
    try:
        response = posts_table.query(
            IndexName='course_id-summary_last_updated-index',
            KeyConditionExpression='course_id = :cid AND summary_last_updated > :cutoff',
            ExpressionAttributeValues={
                ':cid': class_id,
                ':cutoff': cutoff
            }
        )
        
        summaries = []
        for post in response['Items']:
            if post.get('current_summary'):
                summaries.append({
                    'title': post.get('post_title', 'Untitled Post'),
                    'summary': post['current_summary'],
                    'updated': post.get('summary_last_updated', '')
                })
        
        summaries.sort(key=lambda x: x['updated'], reverse=True)
        
        return summaries
        
    except Exception as e:
        print(f"[ERROR] Failed to fetch summaries for {class_id}: {e}")
        return []


def format_summaries_for_llm(summaries: list[dict]) -> str:
    if not summaries:
        return "No recent updates found."
    
    formatted = []
    for i, s in enumerate(summaries, 1):
        formatted.append(f"{i}. **{s['title']}**")
        formatted.append(f"   {s['summary']}")
        formatted.append("")
    
    return "\n".join(formatted)


def chat(connection_id: str, domain_name: str, stage: str, query: str, class_name: str, gpt_model: str, prioritize_instructor: bool) -> Dict[str, int]:    
    apigw_management = apigw(domain_name, stage)

    days = 2
    
    try:
        if not query or not class_name:
            raise ValueError("Missing required fields: message or class")
        
        if class_name not in CLASSES:
            raise ValueError(f"Unknown class: {class_name}")
        
        class_id = CLASSES[class_name]
        
        summaries = get_recent_summaries(class_id, days=days)
        
        if not summaries:
            send_websocket_message(apigw_management, connection_id, {
                "message": f"No posts have been updated in the last {days} days.",
                "type": WebSocketType.CHUNK.value
            })
            return {"statusCode": 200}
        
        summaries_text = format_summaries_for_llm(summaries)
        
        send_websocket_message(apigw_management, connection_id, {
            "message": f"Found {len(summaries)} recent updates. Generating digest...",
            "type": WebSocketType.PROGRESS_UPDATE.value
        })
        
        prompt = (
            f"Here are summaries of {len(summaries)} Piazza posts from the last {days} days:\n\n"
            f"{summaries_text}\n\n"
            "Create a brief digest that tells the user what topics are being discussed and where there's activity. "
            "Don't include all the details - just help them know what's happening and what might need their attention."
            "If there are no summaries, let the user know that there are no recent posts."
        )

        openai_client = openai()
        stream = openai_client.responses.create(
            model=gpt_model,
            reasoning={"effort": "minimal"},
            instructions=create_system_prompt(),
            input=prompt,
            stream=True
        )
        
        send_websocket_message(apigw_management, connection_id, {
            "message": "Start streaming",
            "type": WebSocketType.START.value
        })
        
        for stream_event in stream:
            if stream_event.type == "response.output_text.delta":
                send_websocket_message(apigw_management, connection_id, {
                    "message": stream_event.delta,
                    "type": WebSocketType.CHUNK.value
                })
        
    except Exception as e:
        print(f"Error processing request: {e}")
        send_websocket_message(apigw_management, connection_id, {
            "message": "An error occurred while processing your request. Please try again later.",
            "type": WebSocketType.CHUNK.value
        })
    
    finally:
        send_websocket_message(apigw_management, connection_id, {
            "message": "Finished streaming",
            "type": WebSocketType.DONE.value
        })
    
    return {"statusCode": 200}