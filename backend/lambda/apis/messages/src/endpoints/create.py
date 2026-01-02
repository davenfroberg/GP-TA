import json
from datetime import datetime, timezone

import boto3
from utils.constants import MESSAGES_TABLE_NAME, TABS_TABLE_NAME
from utils.logger import logger


def create_message(body: dict, user_id: str) -> dict:
    dynamo = boto3.resource("dynamodb")
    table = dynamo.Table(MESSAGES_TABLE_NAME)
    tabs_table = dynamo.Table(TABS_TABLE_NAME)

    try:
        logger.info("Creating message", extra={"user_id": user_id})
        raw_tab_id = body.get("tab_id")
        tab_id = str(raw_tab_id) if raw_tab_id is not None else None
        message = body.get("message")
        created_at = datetime.now(timezone.utc).isoformat()
        course_display_name = body.get("course_display_name")

        if not tab_id or not message:
            logger.warning(
                "Missing required fields",
                extra={
                    "user_id": user_id,
                    "tab_id": tab_id,
                    "message_content": message.get("text"),
                },
            )
            return {
                "statusCode": 400,
                "body": json.dumps(
                    {
                        "error": "Missing required fields",
                        "user_id": user_id,
                        "tab_id": tab_id,
                        "course_display_name": course_display_name,
                    }
                ),
            }
        sort_key = f"{tab_id}#{created_at}"
        tab_id_str = str(tab_id)
        message_id_str = str(message.get("id"))

        dynamo_item = {
            "user_id": user_id,
            "tab_id#created_at": sort_key,
            "tab_id": tab_id_str,
            "message_id": message_id_str,
            "role": message.get("role"),
            "text": message.get("text"),
            "created_at": created_at,
            "course_name": course_display_name,
        }

        logger.debug(
            "Creating DynamoDB item",
            extra={
                "tab_id": tab_id_str,
                "tab_id_type": type(tab_id_str).__name__,
                "message_id": message_id_str,
                "message_id_type": type(message_id_str).__name__,
            },
        )
        table.put_item(Item=dynamo_item)

        logger.info(
            "Message created",
            extra={
                "user_id": user_id,
                "tab_id": tab_id,
                "message_id": message.get("id"),
                "message_content": message.get("text"),
            },
        )

        # Update tab last_active_at
        tabs_table.update_item(
            Key={"user_id": user_id, "tab_id": tab_id},
            UpdateExpression="SET last_active_at = :last_active_at",
            ExpressionAttributeValues={":last_active_at": created_at},
        )
        logger.info(
            "Updated tab last_active_at",
            extra={"user_id": user_id, "tab_id": tab_id, "last_active_at": created_at},
        )

        return {
            "statusCode": 200,
            "body": json.dumps(
                {
                    "message": "Message created",
                    "user_id": user_id,
                    "tab_id": tab_id,
                    "message_id": message.get("id"),
                }
            ),
        }
    except json.JSONDecodeError:
        logger.exception("JSON decode error in create_message")
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "Invalid JSON in request body"}),
        }
    except Exception:
        logger.exception(
            "Error creating message",
            extra={"user_id": user_id, "tab_id": tab_id, "message_id": message.get("id")},
        )
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "Internal server error"}),
        }
