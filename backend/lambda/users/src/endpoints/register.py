import json
from datetime import datetime, timezone

import boto3
from utils import USERS_TABLE_NAME, logger


def register_user(event: dict) -> dict:
    dynamo = boto3.resource("dynamodb")
    table = dynamo.Table(USERS_TABLE_NAME)
    try:
        logger.info("Registering user")

        if not event.get("body"):
            logger.warning("Missing request body")
            return {
                "statusCode": 400,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
                "body": json.dumps({"error": "Request body is required"}),
            }

        body = json.loads(event["body"]) if isinstance(event["body"], str) else event["body"]

        email = body.get("email", "")
        name = body.get("name", "")
        user_id = body.get("userId", "")

        if not email or not name or not user_id:
            logger.warning(
                "Missing required fields",
                extra={
                    "has_email": bool(email),
                    "has_name": bool(name),
                    "has_user_id": bool(user_id),
                },
            )
            return {
                "statusCode": 400,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
                "body": json.dumps({"error": "email, name, and userId are required"}),
            }

        try:
            response = table.get_item(Key={"user_id": user_id})
            if "Item" in response:
                logger.info("User already exists", extra={"user_id": user_id, "email": email})
                return {
                    "statusCode": 200,
                    "headers": {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*",
                    },
                    "body": json.dumps(
                        {"message": "User already exists", "user_id": user_id, "email": email}
                    ),
                }
        except Exception:
            logger.exception(
                "Error checking if user exists", extra={"email": email, "user_id": user_id}
            )

        now = datetime.now(timezone.utc).isoformat()
        user_record = {
            "user_id": user_id,
            "email": email,
            "name": name,
            "created_at": now,
            "updated_at": now,
        }

        table.put_item(Item=user_record)

        logger.info(
            "Successfully registered user",
            extra={
                "email": email,
                "user_name": name,
                "user_id": user_id,
            },
        )

        return {
            "statusCode": 201,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            "body": json.dumps(
                {"message": "User registered successfully", "user_id": user_id, "email": email}
            ),
        }

    except json.JSONDecodeError:
        logger.exception("JSON decode error in register_user")
        return {
            "statusCode": 400,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            "body": json.dumps({"error": "Invalid JSON in request body"}),
        }

    except Exception:
        logger.exception("Error registering user")
        return {
            "statusCode": 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            "body": json.dumps({"error": "Internal server error"}),
        }
