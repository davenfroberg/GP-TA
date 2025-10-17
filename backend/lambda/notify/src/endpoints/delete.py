import boto3
import json
from utils.constants import NOTIFICATIONS_TABLE_NAME, SENT_TABLE_NAME, CLASSES
from boto3.dynamodb.conditions import Key
dynamo = boto3.resource('dynamodb')

def delete_sent_notifications(user_query, course_id):
    """Delete all sent notifications for a given course_id and query"""
    table = dynamo.Table(SENT_TABLE_NAME)
    pk = f"{course_id}#{user_query}"
    
    try:
        # Query to get all items with this PK
        response = table.query(
            KeyConditionExpression=Key("course_id#query").eq(pk),
            ProjectionExpression="chunk_id"
        )
        
        # Delete all items with pagination
        while True:
            items = response.get('Items', [])
            
            # Batch delete items
            if items:
                with table.batch_writer() as batch:
                    for item in items:
                        batch.delete_item(
                            Key={
                                'course_id#query': pk,
                                'chunk_id': item['chunk_id']
                            }
                        )
            
            # Check for more pages
            if 'LastEvaluatedKey' not in response:
                break
            
            response = table.query(
                KeyConditionExpression=Key("course_id#query").eq(pk),
                ProjectionExpression="chunk_id",
                ExclusiveStartKey=response['LastEvaluatedKey']
            )
        
        print(f"Deleted all sent notifications for course_id={course_id}, query='{user_query}'")
        
    except Exception as e:
        print(f"Error deleting sent notifications: {str(e)}")
        raise



def delete_notification(event):
    table = dynamo.Table(NOTIFICATIONS_TABLE_NAME)

    headers = {
        'Content-Type': 'application/json'
    }
    
    try:        
        params = event.get('queryStringParameters', {})

        user_query = params.get('user_query', '')
        course_display_name = params.get('course_display_name', '')
        course_id = CLASSES[course_display_name.lower().replace(" ", "")]
        
        table.delete_item(
            Key={
                'course_id': course_id,
                'query': user_query
            }
        )

        delete_sent_notifications(user_query, course_id)
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({'message': 'Notification deleted successfully'})
        }

    except json.JSONDecodeError as e:
        print(f"JSON decode error: {str(e)}")
        return {
            'statusCode': 400,
            'headers': headers,
            'body': json.dumps({'error': 'Invalid JSON in request body'})
        }
    
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({
                'error': 'Internal server error',
                'details': str(e)
            })
        }