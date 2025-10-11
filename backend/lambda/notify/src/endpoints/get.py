import boto3
import json
from utils.constants import DYNAMO_TABLE_NAME
def get_notifications_from_dynamo():
    dynamo = boto3.resource('dynamodb')
    table = dynamo.Table(DYNAMO_TABLE_NAME)

    items = []
    response = table.scan()

    # handle pagination
    while True:
        for entry in response.get('Items', []):
            items.append({
                "query": entry.get("query"),
                "course_name": entry.get("course_display_name")
            })

        # check for more pages
        if 'LastEvaluatedKey' not in response:
            break

        response = table.scan(ExclusiveStartKey=response['LastEvaluatedKey'])
    return items

def get_all_notifications():
    items = get_notifications_from_dynamo()
    return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
            },
            'body': json.dumps(items)
        }