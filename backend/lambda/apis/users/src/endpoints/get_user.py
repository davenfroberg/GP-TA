import json

import boto3
from utils import USERS_TABLE_NAME, logger, parse_user_id


def get_user_from_dynamo(user_id: str) -> dict:
    dynamo = boto3.resource("dynamodb")
    table = dynamo.Table(USERS_TABLE_NAME)
    response = table.get_item(Key={"user_id": user_id})
    user = response.get("Item", {})

    if not user:
        return None

    defaults = {
        "auto_save_chats": True,
        "show_typing_indicator": True,
        "default_chat_mode": "Standard",
        "theme": "dark",
        "font_size": "Medium",
        "compact_mode": False,
        "email_notifications": True,
        "browser_notifications": False,
        "notification_frequency": "Real-time",
    }

    for key, default_value in defaults.items():
        if key not in user:
            user[key] = default_value

    return user


def get_user(event: dict) -> dict:
    user_id = parse_user_id(event)

    if not user_id:
        logger.warning(
            "Missing user_id in authorizer",
            extra={"has_authorizer": bool(event.get("requestContext", {}).get("authorizer"))},
        )
        return {"statusCode": 401, "body": json.dumps({"error": "Unauthorized: Missing user_id"})}

    user = get_user_from_dynamo(user_id)
    if not user:
        logger.warning("User not found in DynamoDB", extra={"user_id": user_id})
        return {"statusCode": 404, "body": json.dumps({"error": "User not found"})}

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(user),
    }
