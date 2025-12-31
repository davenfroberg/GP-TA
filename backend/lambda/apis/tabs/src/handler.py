import json

from endpoints.create import create_tab
from endpoints.delete import delete_tab
from endpoints.get_all import get_all_tabs
from endpoints.update import update_tab
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


def extract_tab_id_from_path(path: str) -> str | None:
    """Extract tab_id from path like /tabs/1234567890."""
    try:
        parts = path.rstrip("/").split("/")
        if len(parts) >= 3 and parts[-2] == "tabs":
            return parts[-1]
    except (ValueError, IndexError):
        pass
    return None


@logger.inject_lambda_context(log_event=True)
def lambda_handler(event: dict, context: dict) -> dict:
    method = event["requestContext"]["http"]["method"]
    path = event["requestContext"]["http"]["path"]

    user_id = parse_user_id(event)

    if not user_id:
        logger.warning(
            "Missing user_id in authorizer",
            extra={"has_authorizer": bool(event.get("requestContext", {}).get("authorizer"))},
        )
        return {"statusCode": 401, "body": json.dumps({"error": "Unauthorized: Missing user_id"})}

    logger.debug("Request authenticated", extra={"user_id": user_id})

    body = json.loads(event.get("body", "{}"))

    try:
        # GET /tabs
        if method == "GET" and path.endswith("/tabs"):
            return get_all_tabs(user_id)

        # POST /tabs
        elif method == "POST" and path.endswith("/tabs"):
            return create_tab(body, user_id)

        # PATCH /tabs/{tab_id}
        elif method == "PATCH":
            tab_id = extract_tab_id_from_path(path)
            if tab_id:
                return update_tab(body, user_id, tab_id)

        # DELETE /tabs/{tab_id}
        elif method == "DELETE":
            tab_id = extract_tab_id_from_path(path)
            if tab_id:
                return delete_tab(user_id, tab_id)

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
