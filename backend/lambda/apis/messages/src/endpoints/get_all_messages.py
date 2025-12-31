import json

import boto3
from boto3.dynamodb.conditions import Key
from utils.constants import MESSAGES_TABLE_NAME
from utils.logger import logger
from utils.utils import convert_decimals


def get_all_messages(user_id: str) -> dict:
    """Get all messages for a user"""
    try:
        dynamo = boto3.resource("dynamodb")
        table = dynamo.Table(MESSAGES_TABLE_NAME)
        response = table.query(KeyConditionExpression=Key("user_id").eq(user_id))
        items = response.get("Items", [])

        # Convert Decimal types to JSON-serializable types
        serializable_items = convert_decimals(items)

        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(serializable_items),
        }
    except Exception:
        logger.exception("Error getting all messages", extra={"user_id": user_id})
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "Internal server error"}),
        }
