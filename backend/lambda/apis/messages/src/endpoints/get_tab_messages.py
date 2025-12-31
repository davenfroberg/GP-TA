import json

import boto3
from boto3.dynamodb.conditions import Key
from utils.constants import MESSAGES_TABLE_NAME
from utils.logger import logger
from utils.utils import convert_decimals


def get_tab_messages(user_id: str, tab_id: str) -> dict:
    """Get all messages associated with a tab"""
    try:
        dynamo = boto3.resource("dynamodb")
        table = dynamo.Table(MESSAGES_TABLE_NAME)

        # Ensure tab_id is a string (it might come as a number from query params)
        tab_id_str = str(tab_id).strip()

        logger.info("Fetching messages for tab", extra={"user_id": user_id, "tab_id": tab_id_str})

        items = []
        page_count = 0

        # Query with pagination support
        # Sort key format is: tab_id#created_at, so we query with begins_with
        sort_key_prefix = f"{tab_id_str}#"
        response = table.query(
            KeyConditionExpression=Key("user_id").eq(user_id)
            & Key("tab_id#created_at").begins_with(sort_key_prefix),
            ScanIndexForward=True,  # Ascending order (oldest messages first)
        )

        # Handle pagination
        while True:
            page_count += 1
            items.extend(response.get("Items", []))

            # Check for more pages
            if "LastEvaluatedKey" not in response:
                break

            response = table.query(
                KeyConditionExpression=Key("user_id").eq(user_id)
                & Key("tab_id#created_at").begins_with(sort_key_prefix),
                ScanIndexForward=True,
                ExclusiveStartKey=response["LastEvaluatedKey"],
            )

        logger.info(
            "Successfully fetched messages for tab",
            extra={
                "user_id": user_id,
                "tab_id": tab_id_str,
                "message_count": len(items),
                "pages_scanned": page_count,
            },
        )

        # Convert Decimal types to JSON-serializable types
        serializable_items = convert_decimals(items)

        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(serializable_items),
        }
    except Exception:
        logger.exception("Error getting tab messages", extra={"user_id": user_id, "tab_id": tab_id})
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "Internal server error"}),
        }
