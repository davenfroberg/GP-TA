import json

import boto3
from utils.constants import NOTIFICATIONS_TABLE_NAME
from utils.logger import logger


def get_notifications_from_dynamo() -> list[dict]:
    dynamo = boto3.resource("dynamodb")
    table = dynamo.Table(NOTIFICATIONS_TABLE_NAME)

    items = []
    page_count = 0

    logger.info("Fetching notifications from DynamoDB")
    try:
        response = table.scan()

        # handle pagination
        while True:
            page_count += 1
            for entry in response.get("Items", []):
                items.append(
                    {"query": entry.get("query"), "course_name": entry.get("course_display_name")}
                )

            # check for more pages
            if "LastEvaluatedKey" not in response:
                break

            response = table.scan(ExclusiveStartKey=response["LastEvaluatedKey"])

        logger.info(
            "Successfully fetched notifications from DynamoDB",
            extra={"notification_count": len(items), "pages_scanned": page_count},
        )
    except Exception:
        logger.exception("Failed to fetch notifications from DynamoDB")
        raise

    return items


def get_all_notifications():
    try:
        items = get_notifications_from_dynamo()
        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
            },
            "body": json.dumps(items),
        }
    except Exception:
        logger.exception("Failed to get all notifications")
        return {
            "statusCode": 500,
            "headers": {
                "Content-Type": "application/json",
            },
            "body": json.dumps({"error": "Internal server error"}),
        }
