import json

import boto3
from boto3.dynamodb.conditions import Key
from utils.constants import NOTIFICATIONS_TABLE_NAME
from utils.logger import logger


def get_notifications_from_dynamo(user_id: str) -> list[dict]:
    dynamo = boto3.resource("dynamodb")
    table = dynamo.Table(NOTIFICATIONS_TABLE_NAME)

    items = []
    page_count = 0

    logger.info("Fetching notifications from DynamoDB", extra={"user_id": user_id})
    try:
        # Query by user_id (partition key)
        response = table.query(KeyConditionExpression=Key("user_id").eq(user_id))

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

            response = table.query(
                KeyConditionExpression=Key("user_id").eq(user_id),
                ExclusiveStartKey=response["LastEvaluatedKey"],
            )

        logger.info(
            "Successfully fetched notifications from DynamoDB",
            extra={
                "notification_count": len(items),
                "pages_scanned": page_count,
                "user_id": user_id,
            },
        )
    except Exception:
        logger.exception("Failed to fetch notifications from DynamoDB")
        raise

    return items


def get_all_notifications(event: dict) -> dict:
    headers = {"Content-Type": "application/json"}

    try:
        request_context = event.get("requestContext", {})
        authorizer = request_context.get("authorizer", {})

        user_id = None
        if authorizer:
            jwt = authorizer.get("jwt", {})
            if jwt:
                claims = jwt.get("claims", {})
                if claims:
                    user_id = claims.get("sub")

        if not user_id:
            logger.warning(
                "Missing user_id in authorizer",
                extra={
                    "has_authorizer": bool(authorizer),
                    "authorizer_keys": list(authorizer.keys()) if authorizer else None,
                },
            )
            return {
                "statusCode": 401,
                "headers": headers,
                "body": json.dumps({"error": "Unauthorized: Missing user_id"}),
            }

        logger.debug("Request authenticated", extra={"user_id": user_id})

        items = get_notifications_from_dynamo(user_id)
        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps(items),
        }
    except Exception:
        logger.exception("Failed to get all notifications")
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": "Internal server error"}),
        }
