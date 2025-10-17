from typing import List, Dict
from utils.clients import pinecone
from utils.constants import PINECONE_INDEX_NAME, CLASSES, THRESHOLD_ADDER, MIN_THRESHOLD, MAX_THRESHOLD, NOTIFICATIONS_TABLE_NAME, MAX_NOTIFICATIONS
import json
import boto3
from decimal import Decimal

def get_closest_embedding_score(query: str, class_id) -> List[Dict]:
    """Search Pinecone for the most relevant chunks for a given query and class."""
    index = pinecone().Index(PINECONE_INDEX_NAME)
    results = index.search(
        namespace="piazza",
        query={
            "top_k": 1,
            "filter": {"class_id": class_id},
            "inputs": {"text": query}
        }
    )
    return results['result']['hits'][0]["_score"]

def compute_notification_threshold(closest_score: float) -> float:
    threshold = closest_score + THRESHOLD_ADDER
    return max(MIN_THRESHOLD, min(threshold, MAX_THRESHOLD))

def create_notification(event):
    dynamo = boto3.resource('dynamodb')
    table = dynamo.Table(NOTIFICATIONS_TABLE_NAME)
    try:
        body = json.loads(event['body']) if isinstance(event['body'], str) else event['body']
        
        user_query = body.get('user_query', '')
        course_display_name = body.get('course_display_name', '')
        course_id = CLASSES[course_display_name.lower().replace(" ", "")]

        response = table.query(
            KeyConditionExpression=(
                boto3.dynamodb.conditions.Key('course_id').eq(course_id) & 
                boto3.dynamodb.conditions.Key('query').eq(user_query)
            )
        )

        items = response.get("Items", [])
        if items:
            # OK response when nothing is created due to duplicate
            return {
                'statusCode': 200,
                'headers': {
                    'Content-Type': 'application/json',
                },
                'body': json.dumps({
                    "query": user_query,
                    "course_display_name": course_display_name
                })
            }

        closest_score = get_closest_embedding_score(user_query, course_id)
        
        notification_threshold = compute_notification_threshold(closest_score)

        dynamo_record = {
            "closest_score": closest_score,
            "notification_threshold": notification_threshold,
            "course_display_name": course_display_name,
            "course_id": course_id, # partition key
            "query": user_query, # sort key
            "max_notifications": MAX_NOTIFICATIONS
        }
        # convert float to decimal for dynamo
        dynamo_record = json.loads(json.dumps(dynamo_record), parse_float=Decimal)

        table.put_item(
            Item=dynamo_record
        )

        # created response
        return {
            'statusCode': 201,
            'headers': {
                'Content-Type': 'application/json',
            },
            'body': json.dumps({
                    "query": user_query,
                    "course_display_name": course_display_name
            })
        }
        
    except json.JSONDecodeError as e:
        print(f"JSON decode error: {str(e)}")
        return {
            'statusCode': 400,
            'headers': {
                'Content-Type': 'application/json',
            },
            'body': json.dumps({
                'error': 'Invalid JSON in request body'
            })
        }
    
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
            },
            'body': json.dumps({
                'error': 'Internal server error',
                'details': str(e)
            })
        }
