import json

import boto3
from boto3.dynamodb.conditions import Key
from utils.constants import COURSES, NOTIFICATIONS_TABLE_NAME, SENT_TABLE_NAME
from utils.logger import logger

dynamo = boto3.resource("dynamodb")


def delete_sent_notifications(user_query, course_id):
    """Delete all sent notifications for a given course_id and query"""
    table = dynamo.Table(SENT_TABLE_NAME)
    pk = f"{course_id}#{user_query}"

    logger.info(
        "Deleting sent notifications",
        extra={"course_id": course_id, "user_query": user_query, "pk": pk},
    )

    try:
        deleted_count = 0
        page_count = 0

        # Query to get all items with this PK
        response = table.query(
            KeyConditionExpression=Key("course_id#query").eq(pk), ProjectionExpression="chunk_id"
        )

        # Delete all items with pagination
        while True:
            page_count += 1
            items = response.get("Items", [])

            # Batch delete items
            if items:
                with table.batch_writer() as batch:
                    for item in items:
                        batch.delete_item(Key={"course_id#query": pk, "chunk_id": item["chunk_id"]})
                        deleted_count += 1

            # Check for more pages
            if "LastEvaluatedKey" not in response:
                break

            response = table.query(
                KeyConditionExpression=Key("course_id#query").eq(pk),
                ProjectionExpression="chunk_id",
                ExclusiveStartKey=response["LastEvaluatedKey"],
            )

        logger.info(
            "Successfully deleted sent notifications",
            extra={
                "course_id": course_id,
                "user_query": user_query,
                "deleted_count": deleted_count,
                "pages_processed": page_count,
            },
        )

    except Exception:
        logger.exception(
            "Error deleting sent notifications",
            extra={"course_id": course_id, "user_query": user_query},
        )
        raise


def delete_notification(event):
    table = dynamo.Table(NOTIFICATIONS_TABLE_NAME)

    headers = {"Content-Type": "application/json"}

    try:
        logger.info("Processing delete notification request")

        params = event.get("queryStringParameters") or {}

        user_query = params.get("user_query", "")
        course_display_name = params.get("course_display_name", "")

        if not user_query or not course_display_name:
            logger.warning(
                "Missing required query parameters",
                extra={
                    "has_user_query": bool(user_query),
                    "has_course_display_name": bool(course_display_name),
                },
            )
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"error": "user_query and course_display_name are required"}),
            }

        course_key = course_display_name.lower().replace(" ", "")
        if course_key not in COURSES:
            logger.warning(
                "Course not found in COURSES mapping",
                extra={"course_display_name": course_display_name, "course_key": course_key},
            )
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"error": f'Course "{course_display_name}" not found'}),
            }

        course_id = COURSES[course_key]

        logger.info(
            "Deleting notification",
            extra={
                "user_query": user_query,
                "course_display_name": course_display_name,
                "course_id": course_id,
            },
        )

        table.delete_item(Key={"course_id": course_id, "query": user_query})

        delete_sent_notifications(user_query, course_id)

        logger.info(
            "Successfully deleted notification",
            extra={
                "user_query": user_query,
                "course_id": course_id,
                "course_display_name": course_display_name,
            },
        )

        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({"message": "Notification deleted successfully"}),
        }

    except json.JSONDecodeError:
        logger.exception("JSON decode error in delete_notification")
        return {
            "statusCode": 400,
            "headers": headers,
            "body": json.dumps({"error": "Invalid JSON in request body"}),
        }

    except Exception:
        logger.exception("Error deleting notification")
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": "Internal server error"}),
        }
