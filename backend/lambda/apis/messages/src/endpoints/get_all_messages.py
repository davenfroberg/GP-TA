import boto3
from boto3.dynamodb.conditions import Key
from utils.constants import MESSAGES_TABLE_NAME


def get_all_messages(user_id: str) -> dict:
    dynamo = boto3.resource("dynamodb")
    table = dynamo.Table(MESSAGES_TABLE_NAME)
    response = table.query(KeyConditionExpression=Key("user_id").eq(user_id))
    return response.get("Items", [])
