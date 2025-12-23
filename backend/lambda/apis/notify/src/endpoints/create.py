import json
from decimal import Decimal

import boto3
from utils.clients import pinecone
from utils.constants import (
    COURSES,
    MAX_NOTIFICATIONS,
    MAX_THRESHOLD,
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


def create_notification(event: dict) -> dict:
    dynamo = boto3.resource("dynamodb")
    table = dynamo.Table(NOTIFICATIONS_TABLE_NAME)
    headers = {"Content-Type": "application/json"}

    try:
        logger.info("Creating notification")

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
            logger.warning("Missing user_id in authorizer claims")
            return {
                "statusCode": 401,
                "headers": headers,
                "body": json.dumps({"error": "Unauthorized: Missing user_id"}),
            }

        logger.debug("Request authenticated", extra={"user_id": user_id})

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
