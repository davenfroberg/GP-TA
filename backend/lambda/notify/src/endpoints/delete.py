import boto3
import json
from utils.constants import DYNAMO_TABLE_NAME, CLASSES
from boto3.dynamodb.conditions import Key

def delete_notification(event):
    dynamo = boto3.resource('dynamodb')
    table = dynamo.Table(DYNAMO_TABLE_NAME)

    cors_headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
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
        
        return {
            'statusCode': 200,
            'headers': cors_headers,
            'body': json.dumps({'message': 'Notification deleted successfully'})
        }

    except json.JSONDecodeError as e:
        print(f"JSON decode error: {str(e)}")
        return {
            'statusCode': 400,
            'headers': cors_headers,
            'body': json.dumps({'error': 'Invalid JSON in request body'})
        }
    
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': cors_headers,
            'body': json.dumps({
                'error': 'Internal server error',
                'details': str(e)
            })
        }