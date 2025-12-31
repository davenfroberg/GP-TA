import json

import boto3
from boto3.dynamodb.conditions import Key
from utils.constants import TABS_TABLE_NAME
from utils.logger import logger


def get_all_tabs(user_id: str) -> dict:
    """Get all tabs for a user."""
    try:
        dynamo = boto3.resource("dynamodb")
        table = dynamo.Table(TABS_TABLE_NAME)

        response = table.query(
            KeyConditionExpression=Key("user_id").eq(user_id),
            ScanIndexForward=True,  # Sort by tab_id ascending (oldest first)
        )

        tabs = response.get("Items", [])

        # Transform DynamoDB items to frontend format
        formatted_tabs = []
        for tab in tabs:
            formatted_tabs.append(
                {
                    "id": int(tab.get("tab_id", 0)),
                    "title": tab.get("title", "Untitled"),
                    "created_at": tab.get("created_at", ""),
                    "updated_at": tab.get("updated_at", ""),
                    "last_active_at": tab.get("last_active_at", ""),
                }
            )

        logger.info("Retrieved tabs", extra={"user_id": user_id, "count": len(formatted_tabs)})

        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"tabs": formatted_tabs}),
        }
    except Exception:
        logger.exception("Error retrieving tabs", extra={"user_id": user_id})
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "Internal server error"}),
        }
