import json

from endpoints.create import create_message
from endpoints.get_all_messages import get_all_messages
from endpoints.get_tab_messages import get_tab_messages
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
    path = event["requestContext"]["http"]["path"]

    # Parse user_id from event
    user_id = parse_user_id(event)

    if not user_id:
        logger.warning(
            "Missing user_id in authorizer",
            extra={"has_authorizer": bool(event.get("requestContext", {}).get("authorizer"))},
        )
        return {"statusCode": 401, "body": json.dumps({"error": "Unauthorized: Missing user_id"})}

    logger.debug("Request authenticated", extra={"user_id": user_id})

    body = json.loads(event.get("body", "{}"))

    # Parse query parameters
    query_params = event.get("queryStringParameters") or {}

    try:
        if method == "POST" and path.endswith("/messages"):
            return create_message(body, user_id)
        elif method == "GET" and path.endswith("/messages"):
            # Check if tab_id query parameter is provided
            tab_id = query_params.get("tab_id")
            if tab_id:
                return get_tab_messages(user_id, tab_id)
            else:
                return get_all_messages(user_id)
        else:
            logger.warning(
                "Unsupported HTTP method or path", extra={"method": method, "path": path}
            )
            return {"statusCode": 404, "body": json.dumps({"error": "Not found"})}
    except Exception:
        logger.exception(
            "Unexpected error in lambda_handler", extra={"method": method, "path": path}
        )
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "Internal server error"}),
        }
