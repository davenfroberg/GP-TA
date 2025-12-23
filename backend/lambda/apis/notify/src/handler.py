import json

from endpoints.create import create_notification
from endpoints.delete import delete_notification
from endpoints.get import get_all_notifications
from utils.logger import logger


def parse_user_id(event: dict) -> str | None:
    """Extract user_id from the event's authorizer claims."""
    request_context = event.get("requestContext", {})
    authorizer = request_context.get("authorizer", {})

    user_id = None
    if authorizer:
        jwt = authorizer.get("jwt", {})
        if jwt:
            claims = jwt.get("claims", {})
            if claims:
                user_id = claims.get("sub")

    return user_id


@logger.inject_lambda_context(log_event=True)
def lambda_handler(event: dict, context: dict) -> dict:
    method = event["requestContext"]["http"]["method"]
    logger.info("Processing notify request", extra={"method": method})

    try:
        # Parse user_id from event
        user_id = parse_user_id(event)

        if not user_id:
            logger.warning(
                "Missing user_id in authorizer",
                extra={
                    "has_authorizer": bool(event.get("requestContext", {}).get("authorizer")),
                },
            )
            return {
                "statusCode": 401,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Unauthorized: Missing user_id"}),
            }

        logger.debug("Request authenticated", extra={"user_id": user_id})

        if method == "GET":
            return get_all_notifications(event, user_id)
        elif method == "POST":
            return create_notification(event, user_id)
        elif method == "DELETE":
            return delete_notification(event, user_id)
        else:
            logger.warning("Unsupported HTTP method", extra={"method": method})
            return {
                "statusCode": 404,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Not found"}),
            }
    except Exception:
        logger.exception("Unexpected error in lambda_handler", extra={"method": method})
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "Internal server error"}),
        }
