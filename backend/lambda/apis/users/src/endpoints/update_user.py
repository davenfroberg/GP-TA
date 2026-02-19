import json

import boto3
from utils import LOCKED_FIELDS, USERS_TABLE_NAME, logger, parse_user_id


def update_user(event: dict) -> dict:
    user_id = parse_user_id(event)

    if not user_id:
        logger.warning(
            "Missing user_id in authorizer",
            extra={"has_authorizer": bool(event.get("requestContext", {}).get("authorizer"))},
        )
        return {"statusCode": 401, "body": json.dumps({"error": "Unauthorized: Missing user_id"})}

    updates = json.loads(event["body"])

    if not updates:
        return {"statusCode": 400, "body": json.dumps({"error": "No updates provided"})}
    if any(field in LOCKED_FIELDS for field in updates.keys()):
        return {"statusCode": 400, "body": json.dumps({"error": "Locked fields cannot be updated"})}

    dynamo = boto3.resource("dynamodb")
    table = dynamo.Table(USERS_TABLE_NAME)

    update_expression = "SET " + ", ".join(f"#{field} = :{field}" for field in updates.keys())
    logger.info(
        "Updating user",
        extra={"user_id": user_id, "updates": updates, "update_expression": update_expression},
    )
    try:
        table.update_item(
            Key={"user_id": user_id},
            UpdateExpression=update_expression,
            ExpressionAttributeNames={f"#{field}": field for field in updates.keys()},
            ExpressionAttributeValues={f":{field}": updates[field] for field in updates.keys()},
        )
    except Exception as e:
        logger.exception(
            "Error updating user", extra={"user_id": user_id, "updates": updates, "error": str(e)}
        )
        return {"statusCode": 500, "body": json.dumps({"error": "Internal server error"})}

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"message": "User updated"}),
    }
