import json

import boto3
from boto3.dynamodb.conditions import Key
from utils.constants import MESSAGES_TABLE_NAME, TABS_TABLE_NAME
from utils.logger import logger


def delete_tab(user_id: str, tab_id: str) -> dict:
    """Delete a tab and all its associated messages."""
    try:
        dynamo = boto3.resource("dynamodb")
        tabs_table = dynamo.Table(TABS_TABLE_NAME)
        messages_table = dynamo.Table(MESSAGES_TABLE_NAME)

        # Check if tab exists and belongs to user
        try:
            existing_tab = tabs_table.get_item(Key={"user_id": user_id, "tab_id": tab_id}).get(
                "Item"
            )

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

        # Delete all messages associated with this tab
        # Sort key format is: tab_id#created_at, so we query with begins_with
        sort_key_prefix = f"{tab_id}#"
        deleted_message_count = 0

        try:
            response = messages_table.query(
                KeyConditionExpression=Key("user_id").eq(user_id)
                & Key("tab_id#created_at").begins_with(sort_key_prefix)
            )

            messages = response.get("Items", [])

            with messages_table.batch_writer() as batch:
                for message in messages:
                    batch.delete_item(
                        Key={
                            "user_id": user_id,
                            "tab_id#created_at": message["tab_id#created_at"],
                        }
                    )
                    deleted_message_count += 1

            while "LastEvaluatedKey" in response:
                response = messages_table.query(
                    KeyConditionExpression=Key("user_id").eq(user_id)
                    & Key("tab_id#created_at").begins_with(sort_key_prefix),
                    ExclusiveStartKey=response["LastEvaluatedKey"],
                )
                messages = response.get("Items", [])
                with messages_table.batch_writer() as batch:
                    for message in messages:
                        batch.delete_item(
                            Key={
                                "user_id": user_id,
                                "tab_id#created_at": message["tab_id#created_at"],
                            }
                        )
                        deleted_message_count += 1

            logger.info(
                "Deleted messages from tab",
                extra={
                    "user_id": user_id,
                    "tab_id": tab_id,
                    "deleted_message_count": deleted_message_count,
                },
            )
        except Exception:
            logger.exception(
                "Error deleting messages from tab",
                extra={"user_id": user_id, "tab_id": tab_id},
            )

        tabs_table.delete_item(Key={"user_id": user_id, "tab_id": tab_id})

        logger.info(
            "Deleted tab",
            extra={
                "user_id": user_id,
                "tab_id": tab_id,
                "deleted_message_count": deleted_message_count,
            },
        )

        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(
                {
                    "message": "Tab deleted successfully",
                    "deleted_message_count": deleted_message_count,
                }
            ),
        }
    except Exception:
        logger.exception("Error deleting tab", extra={"user_id": user_id, "tab_id": tab_id})
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "Internal server error"}),
        }
