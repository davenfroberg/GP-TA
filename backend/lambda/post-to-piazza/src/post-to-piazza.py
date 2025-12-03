import json

import boto3
from botocore.exceptions import ClientError
from piazza_api import Piazza
from utils.constants import AWS_REGION_NAME, COURSE_TO_ID, SECRETS
from utils.logger import logger


def get_secret_api_key(secret_name: str, region_name: str = AWS_REGION_NAME) -> str:
    """Get API key from AWS Parameter Store"""
    session = boto3.session.Session()
    client = session.client(service_name="ssm", region_name=region_name)
    try:
        logger.debug("Retrieving secret from Parameter Store", extra={"secret_name": secret_name})
        response = client.get_parameter(Name=secret_name, WithDecryption=True)
        logger.debug(
            "Successfully retrieved secret from Parameter Store", extra={"secret_name": secret_name}
        )
        return response["Parameter"]["Value"]
    except ClientError as e:
        logger.exception(
            "Failed to retrieve credentials from Parameter Store",
            extra={"secret_name": secret_name},
        )
        raise RuntimeError(f"Failed to retrieve credentials from Parameter Store: {e}") from e
    except Exception:
        logger.exception("Unexpected error retrieving secret", extra={"secret_name": secret_name})
        raise


def get_piazza_credentials(
    username_secret: str = SECRETS["PIAZZA_USER"],
    password_secret: str = SECRETS["PIAZZA_PASS"],
    region_name: str = AWS_REGION_NAME,
) -> tuple[str, str]:
    """Get Piazza username and password from AWS Parameter Store"""
    session = boto3.session.Session()
    client = session.client(service_name="ssm", region_name=region_name)
    try:
        logger.debug("Retrieving Piazza credentials from Parameter Store")
        username_response = client.get_parameter(Name=username_secret, WithDecryption=True)
        password_response = client.get_parameter(Name=password_secret, WithDecryption=True)
        username = username_response["Parameter"]["Value"]
        password = password_response["Parameter"]["Value"]

        logger.debug("Successfully retrieved Piazza credentials from Parameter Store")
        return username, password
    except ClientError:
        logger.exception("Failed to retrieve Piazza credentials from Parameter Store")
        raise
    except Exception:
        logger.exception("Unexpected error retrieving Piazza credentials")
        raise


@logger.inject_lambda_context(log_event=True)
def lambda_handler(event: dict, context: dict) -> dict:
    # Handle CORS preflight requests
    if event.get("httpMethod") == "OPTIONS":
        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
            },
            "body": "",
        }

    try:
        logger.info("Processing post-to-piazza request")

        # Parse the request body from API Gateway
        try:
            if event.get("body"):
                body = json.loads(event["body"])
            else:
                body = {}
        except json.JSONDecodeError:
            logger.exception("Failed to parse request body as JSON")
            return {
                "statusCode": 400,
                "headers": {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"},
                "body": json.dumps({"success": False, "error": "Invalid JSON in request body"}),
            }

        # Extract parameters from the request body
        api_key = body.get("api_key")
        try:
            expected_key = get_secret_api_key(SECRETS["API_KEY"])
        except Exception:
            logger.exception("Failed to retrieve API key from Parameter Store")
            return {
                "statusCode": 500,
                "headers": {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"},
                "body": json.dumps(
                    {"success": False, "error": "Internal server error: Failed to validate API key"}
                ),
            }

        if api_key != expected_key:
            logger.warning("Invalid API key provided")
            return {
                "statusCode": 403,
                "headers": {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"},
                "body": json.dumps({"success": False, "error": "Invalid API key"}),
            }

        course = body.get("course")
        network = COURSE_TO_ID.get(course)
        post_type = body.get("post_type", "question")
        post_folders = body.get("post_folders")
        post_subject = body.get("post_subject")
        post_content = body.get("post_content")
        anonymous = bool(body.get("anonymous", "True"))

        # Check if course is in the mapping
        if not network:
            logger.warning("Course not found in COURSE_TO_ID mapping", extra={"course": course})
            return {
                "statusCode": 400,
                "headers": {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"},
                "body": json.dumps({"success": False, "error": f'Course "{course}" not found'}),
            }

        if not all([network, post_type, post_folders, post_subject, post_content]):
            logger.warning(
                "Missing required parameters",
                extra={
                    "has_network": bool(network),
                    "has_post_type": bool(post_type),
                    "has_post_folders": bool(post_folders),
                    "has_post_subject": bool(post_subject),
                    "has_post_content": bool(post_content),
                },
            )
            return {
                "statusCode": 400,
                "headers": {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"},
                "body": json.dumps({"success": False, "error": "Missing required parameters"}),
            }

        try:
            username, password = get_piazza_credentials()
        except Exception:
            logger.exception("Failed to retrieve Piazza credentials")
            return {
                "statusCode": 500,
                "headers": {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"},
                "body": json.dumps(
                    {
                        "success": False,
                        "error": "Internal server error: Failed to retrieve credentials",
                    }
                ),
            }

        p = Piazza()
        p.user_login(email=username, password=password)
        piazza_network = p.network(network)
        post_info = piazza_network.create_post(
            post_type, post_folders, post_subject, post_content, anonymous=anonymous
        )

        post_number = post_info["nr"]
        post_link = f"https://piazza.com/class/{network}/post/{post_number}"

        logger.info(
            "Post creation request processed successfully",
            extra={
                "course": course,
                "course_id": network,
                "post_type": post_type,
                "anonymous": anonymous,
            },
        )

        return {
            "statusCode": 200,
            "headers": {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"},
            "body": json.dumps(
                {
                    "success": True,
                    "message": "Post created successfully",
                    "post_link": post_link,
                    "post_number": post_number,
                }
            ),
        }

    except Exception:
        logger.exception("Unexpected error in lambda_handler")
        return {
            "statusCode": 500,
            "headers": {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"},
            "body": json.dumps({"success": False, "error": "Internal server error"}),
        }
