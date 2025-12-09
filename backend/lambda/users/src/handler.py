from endpoints.register import register_user
from utils import logger


@logger.inject_lambda_context(log_event=True)
def lambda_handler(event: dict, context: dict) -> dict:
    request_context = event.get("requestContext", {})
    http_context = request_context.get("http", {})
    method = http_context.get("method", "")
    path = http_context.get("path", "")

    if not method:
        logger.error(
            "Missing HTTP method in request context", extra={"requestContext": request_context}
        )
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": '{"error": "Invalid request format"}',
        }

    try:
        if method == "POST":
            if path.endswith("/user"):
                return register_user(event)
            else:
                logger.warning("POST to invalid path", extra={"path": path})
                return {
                    "statusCode": 404,
                    "headers": {"Content-Type": "application/json"},
                    "body": '{"error": "Not found - POST must be to /user"}',
                }
        else:
            logger.warning("Unsupported HTTP method", extra={"method": method, "path": path})
            return {
                "statusCode": 404,
                "headers": {"Content-Type": "application/json"},
                "body": '{"error": "Method not allowed"}',
            }
    except KeyError as e:
        logger.exception(
            "Missing key in event", extra={"key": str(e), "method": method, "path": path}
        )
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": '{"error": "Internal server error - invalid event structure"}',
        }
    except Exception:
        logger.exception(
            "Unexpected error in lambda_handler", extra={"method": method, "path": path}
        )
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": '{"error": "Internal server error"}',
        }
