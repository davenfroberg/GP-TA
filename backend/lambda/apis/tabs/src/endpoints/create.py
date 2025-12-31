import json
from datetime import datetime, timezone

import boto3
from utils.constants import TABS_TABLE_NAME
from utils.logger import logger


def create_tab(body: dict, user_id: str) -> dict:
    """Create a new tab."""
    try:
        dynamo = boto3.resource("dynamodb")
        table = dynamo.Table(TABS_TABLE_NAME)

        title = body.get("title", "New Chat")
        tab_id = body.get("tab_id")  # Frontend can provide tab_id (timestamp), or we generate one

        if not tab_id:
            # Generate tab_id from current timestamp if not provided
            tab_id = int(datetime.now(timezone.utc).timestamp() * 1000)

        created_at = datetime.now(timezone.utc).isoformat()

        tab_item = {
            "user_id": user_id,
            "tab_id": str(tab_id),
            "title": title,
            "created_at": created_at,
            "last_active_at": created_at,
        }

        table.put_item(Item=tab_item)

        logger.info("Created tab", extra={"user_id": user_id, "tab_id": tab_id, "title": title})

        return {
            "statusCode": 201,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(
                {
                    "tab_id": tab_id,
                    "title": title,
                    "created_at": created_at,
                    "last_active_at": created_at,
                }
            ),
        }
    except json.JSONDecodeError:
        logger.exception("JSON decode error in create_tab")
        return {
            "statusCode": 400,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "Invalid JSON in request body"}),
        }
    except Exception:
        logger.exception("Error creating tab", extra={"user_id": user_id})
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "Internal server error"}),
        }
