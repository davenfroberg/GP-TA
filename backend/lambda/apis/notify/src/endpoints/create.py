import json
from decimal import Decimal

import boto3
from utils.clients import pinecone
from utils.constants import (
    COURSES,
    MAX_NOTIFICATIONS,
    MAX_THRESHOLD,
    MESSAGES_TABLE_NAME,
    MIN_THRESHOLD,
    NOTIFICATIONS_TABLE_NAME,
    PINECONE_INDEX_NAME,
    THRESHOLD_ADDER,
)
from utils.logger import logger


def get_closest_embedding_score(query: str, course_id: str) -> list[dict]:
    """Search Pinecone for the most relevant chunks for a given query and course_id."""
    try:
        logger.debug(
            "Searching Pinecone for closest embedding",
            extra={"query": query, "class_id": course_id},
        )
        index = pinecone().Index(PINECONE_INDEX_NAME)
        results = index.search(
            namespace="piazza",
            query={"top_k": 1, "filter": {"class_id": course_id}, "inputs": {"text": query}},
        )
        score = results["result"]["hits"][0]["_score"]
        logger.debug(
            "Found closest embedding score",
            extra={"query": query, "class_id": course_id, "score": score},
        )
        return score
    except Exception:
        logger.exception(
            "Failed to get closest embedding score", extra={"query": query, "class_id": course_id}
        )
        raise


def compute_notification_threshold(closest_score: float) -> float:
    threshold = closest_score + THRESHOLD_ADDER
    return max(MIN_THRESHOLD, min(threshold, MAX_THRESHOLD))


def create_notification(event: dict, user_id: str) -> dict:
    dynamo = boto3.resource("dynamodb")
    table = dynamo.Table(NOTIFICATIONS_TABLE_NAME)
    headers = {"Content-Type": "application/json"}

    try:
        logger.info("Creating notification", extra={"user_id": user_id})

        if not event.get("body"):
            logger.warning("Missing request body")
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"error": "Request body is required"}),
            }

        body = json.loads(event["body"]) if isinstance(event["body"], str) else event["body"]

        user_query = body.get("user_query", "")
        course_display_name = body.get("course_display_name", "")

        if not user_query or not course_display_name:
            logger.warning(
                "Missing required fields",
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
            "Processing notification creation",
            extra={
                "user_query": user_query,
                "course_display_name": course_display_name,
                "course_id": course_id,
                "user_id": user_id,
            },
        )

        # New schema: PK=user_id, SK=course_id#query
        sort_key = f"{course_id}#{user_query}"

        response = table.query(
            KeyConditionExpression=(
                boto3.dynamodb.conditions.Key("user_id").eq(user_id)
                & boto3.dynamodb.conditions.Key("course_id#query").eq(sort_key)
            )
        )

        items = response.get("Items", [])
        if items:
            # OK response when nothing is created due to duplicate
            logger.info(
                "Notification already exists",
                extra={
                    "user_query": user_query,
                    "course_id": course_id,
                    "course_display_name": course_display_name,
                    "user_id": user_id,
                },
            )
            return {
                "statusCode": 200,
                "headers": headers,
                "body": json.dumps({"query": user_query, "course_name": course_display_name}),
            }

        closest_score = get_closest_embedding_score(user_query, course_id)

        notification_threshold = compute_notification_threshold(closest_score)

        logger.info(
            "Computed notification threshold",
            extra={
                "user_query": user_query,
                "course_id": course_id,
                "closest_score": closest_score,
                "notification_threshold": notification_threshold,
            },
        )

        dynamo_record = {
            "user_id": user_id,  # partition key
            "course_id#query": sort_key,  # sort key
            "course_id": course_id,  # denormalized for easier access
            "query": user_query,  # denormalized for easier access
            "closest_score": closest_score,
            "notification_threshold": notification_threshold,
            "course_display_name": course_display_name,
            "max_notifications": MAX_NOTIFICATIONS,
        }
        # convert float to decimal for dynamo
        dynamo_record = json.loads(json.dumps(dynamo_record), parse_float=Decimal)

        table.put_item(Item=dynamo_record)

        logger.info(
            "Successfully created notification",
            extra={
                "user_query": user_query,
                "course_id": course_id,
                "course_display_name": course_display_name,
                "user_id": user_id,
            },
        )

        tab_id = str(body.get("tab_id"))
        message_id = str(body.get("message_id"))

        if tab_id and message_id:
            try:
                messages_table = dynamo.Table(MESSAGES_TABLE_NAME)

                try:
                    response = messages_table.query(
                        IndexName="message_id_index",
                        KeyConditionExpression=(
                            boto3.dynamodb.conditions.Key("user_id").eq(user_id)
                            & boto3.dynamodb.conditions.Key("tab_id").eq(tab_id)
                            & boto3.dynamodb.conditions.Key("message_id").eq(message_id)
                        ),
                    )
                except Exception as gsi_error:
                    logger.warning(
                        "GSI query failed, using fallback method",
                        extra={
                            "error": str(gsi_error),
                            "user_id": user_id,
                            "tab_id": tab_id,
                            "message_id": message_id,
                        },
                    )
                    sort_key_prefix = f"{tab_id}#"
                    response = messages_table.query(
                        KeyConditionExpression=(
                            boto3.dynamodb.conditions.Key("user_id").eq(user_id)
                            & boto3.dynamodb.conditions.Key("tab_id#created_at").begins_with(
                                sort_key_prefix
                            )
                        ),
                        FilterExpression=boto3.dynamodb.conditions.Attr("message_id").eq(
                            message_id
                        ),
                    )

                items = response.get("Items", [])
                if items:
                    message_item = items[0]
                    # Check if tab_id#created_at is in the GSI result
                    # If not, query the base table to get the full item
                    if "tab_id#created_at" not in message_item:
                        # GSI doesn't project the base table sort key, query base table
                        sort_key_prefix = f"{tab_id}#"
                        base_response = messages_table.query(
                            KeyConditionExpression=(
                                boto3.dynamodb.conditions.Key("user_id").eq(user_id)
                                & boto3.dynamodb.conditions.Key("tab_id#created_at").begins_with(
                                    sort_key_prefix
                                )
                            ),
                            FilterExpression=boto3.dynamodb.conditions.Attr("message_id").eq(
                                message_id
                            ),
                        )
                        base_items = base_response.get("Items", [])
                        if base_items:
                            message_item = base_items[0]
                        else:
                            logger.warning(
                                "Message not found in base table after GSI query",
                                extra={
                                    "user_id": user_id,
                                    "tab_id": tab_id,
                                    "message_id": message_id,
                                },
                            )
                            return {
                                "statusCode": 201,
                                "headers": headers,
                                "body": json.dumps(
                                    {"query": user_query, "course_name": course_display_name}
                                ),
                            }

                    # Now we have tab_id#created_at, update the message
                    messages_table.update_item(
                        Key={
                            "user_id": user_id,
                            "tab_id#created_at": message_item["tab_id#created_at"],
                        },
                        UpdateExpression="SET notification_created = :val",
                        ExpressionAttributeValues={":val": True},
                    )
                    logger.info(
                        "Updated message notification_created flag",
                        extra={
                            "user_id": user_id,
                            "tab_id": tab_id,
                            "message_id": message_id,
                        },
                    )
                else:
                    logger.warning(
                        "Message not found for notification update",
                        extra={
                            "user_id": user_id,
                            "tab_id": tab_id,
                            "message_id": message_id,
                        },
                    )
            except Exception as update_error:
                logger.exception(
                    "Failed to update message notification_created flag",
                    extra={
                        "user_id": user_id,
                        "tab_id": tab_id,
                        "message_id": message_id,
                        "error": str(update_error),
                    },
                )

        # created response
        return {
            "statusCode": 201,
            "headers": headers,
            "body": json.dumps({"query": user_query, "course_name": course_display_name}),
        }

    except json.JSONDecodeError:
        logger.exception("JSON decode error in create_notification")
        return {
            "statusCode": 400,
            "headers": headers,
            "body": json.dumps({"error": "Invalid JSON in request body"}),
        }

    except Exception:
        logger.exception("Error creating notification")
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": "Internal server error"}),
        }
