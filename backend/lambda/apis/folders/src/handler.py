import json

from endpoints.get import get_folders
from utils.logger import logger


def extract_course_from_path(path: str) -> str | None:
    """Extract course from path like /folders/CPSC 110."""
    try:
        parts = path.rstrip("/").split("/")
        if len(parts) >= 3 and parts[-2] == "folders":
            return parts[-1]
    except (ValueError, IndexError):
        pass
    return None


@logger.inject_lambda_context(log_event=True)
def lambda_handler(event: dict, context: dict) -> dict:
    method = event["requestContext"]["http"]["method"]
    path = event["requestContext"]["http"]["path"]
    logger.info("Processing folders request", extra={"method": method, "path": path})

    try:
        if method == "GET":
            course = extract_course_from_path(path)
            if not course:
                logger.warning("Missing course in path", extra={"path": path})
                return {
                    "statusCode": 400,
                    "headers": {"Content-Type": "application/json"},
                    "body": json.dumps({"error": "Course parameter is required in path"}),
                }
            return get_folders(course)
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
