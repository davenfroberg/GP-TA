import json
from datetime import datetime, timezone

import boto3
from utils.constants import TABS_TABLE_NAME
from utils.logger import logger


def update_tab(body: dict, user_id: str, tab_id: str) -> dict:
    """Update a tab (currently only supports updating title)."""
    try:
        dynamo = boto3.resource("dynamodb")
        table = dynamo.Table(TABS_TABLE_NAME)

        # Check if tab exists and belongs to user
        try:
            existing_tab = table.get_item(Key={"user_id": user_id, "tab_id": tab_id}).get("Item")

            if not existing_tab:
                return {
                    "statusCode": 404,
                    "headers": {"Content-Type": "application/json"},
                    "body": json.dumps({"error": "Tab not found"}),
                }
        except Exception:
            logger.exception(
                "Error checking tab existence", extra={"user_id": user_id, "tab_id": tab_id}
            )
            return {
                "statusCode": 500,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Internal server error"}),
            }

        # Update title if provided
        title = body.get("title")
        if not title:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "title is required"}),
            }

        updated_at = datetime.now(timezone.utc).isoformat()

        table.update_item(
            Key={"user_id": user_id, "tab_id": tab_id},
            UpdateExpression="SET title = :title, updated_at = :updated_at",
            ExpressionAttributeValues={
                ":title": title,
                ":updated_at": updated_at,
            },
        )

        logger.info("Updated tab", extra={"user_id": user_id, "tab_id": tab_id, "title": title})

        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(
                {
                    "tab_id": tab_id,
                    "title": title,
                    "updated_at": updated_at,
                }
            ),
        }
    except json.JSONDecodeError:
        logger.exception("JSON decode error in update_tab")
        return {
            "statusCode": 400,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "Invalid JSON in request body"}),
        }
    except Exception:
        logger.exception("Error updating tab", extra={"user_id": user_id, "tab_id": tab_id})
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "Internal server error"}),
        }
