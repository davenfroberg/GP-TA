from endpoints.create import create_notification
from endpoints.delete import delete_notification
from endpoints.get import get_all_notifications
from utils.logger import logger


@logger.inject_lambda_context(log_event=True)
def lambda_handler(event, context):
    method = event["requestContext"]["http"]["method"]
    logger.info("Processing notify request", extra={"method": method})

    try:
        if method == "GET":
            return get_all_notifications()
        elif method == "POST":
            return create_notification(event)
        elif method == "DELETE":
            return delete_notification(event)
        else:
            logger.warning("Unsupported HTTP method", extra={"method": method})
            return {"statusCode": 404, "body": "Not found"}
    except Exception:
        logger.exception("Unexpected error in lambda_handler", extra={"method": method})
        return {
            "statusCode": 500,
            "headers": {
                "Content-Type": "application/json",
            },
            "body": '{"error": "Internal server error"}',
        }
