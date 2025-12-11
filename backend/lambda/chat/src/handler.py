import json
from uuid import uuid4

from auth_utils import verify_cognito_jwt  # pyright: ignore[reportMissingImports]; b/c in layer
from enums.Intent import Intent
from enums.WebSocketType import WebSocketType
from predict_intent import predict_intent  # type: ignore ; b/c this is in lambda layer
from utils.clients import apigw, openai
from utils.constants import EMBEDDING_MODEL
from utils.logger import logger
from utils.utils import normalize_query, send_websocket_message


@logger.inject_lambda_context(log_event=False)
def lambda_handler(event: dict, context: dict) -> dict:
    """
    Intent detection lambda.
    Decides what to do with the incoming message.
    """
    connection_id = None
    domain_name = None
    stage = None

    try:
        connection_id = event["requestContext"]["connectionId"]
        domain_name = event["requestContext"]["domainName"]
        stage = event["requestContext"]["stage"]

        body = json.loads(event.get("body", "{}"))

        # Verify JWT token from message
        token = body.get("token")
        if not token:
            logger.warning("Missing JWT token in message", extra={"connection_id": connection_id})
            send_websocket_message(
                apigw(domain_name, stage),
                connection_id,
                {
                    "message": "Authentication required. Please log in again.",
                    "type": WebSocketType.CHUNK.value,
                },
            )
            send_websocket_message(
                apigw(domain_name, stage),
                connection_id,
                {"message": "Finished streaming", "type": WebSocketType.DONE.value},
            )
            return {"statusCode": 401, "body": json.dumps({"error": "Unauthorized: Missing token"})}

        try:
            claims = verify_cognito_jwt(token)
            user_id = claims.get("sub")
            logger.debug(
                "Message authenticated",
                extra={"user_id": user_id, "connection_id": connection_id},
            )
        except ValueError as e:
            logger.warning(
                "Invalid JWT token in message",
                extra={"error": str(e), "connection_id": connection_id},
            )
            send_websocket_message(
                apigw(domain_name, stage),
                connection_id,
                {
                    "message": "Authentication failed. Please log in again.",
                    "type": WebSocketType.CHUNK.value,
                },
            )
            send_websocket_message(
                apigw(domain_name, stage),
                connection_id,
                {"message": "Finished streaming", "type": WebSocketType.DONE.value},
            )
            return {"statusCode": 401, "body": json.dumps({"error": "Unauthorized: Invalid token"})}

        message = body.get("message")
        course_name = body.get("course_name")
        model = body.get("model", "gpt-5")
        prioritize_instructor = body.get("prioritizeInstructor", False)

        if not message:
            logger.warning("Missing message in request", extra={"connection_id": connection_id})
            raise ValueError("Message is required")

        embedding_response = openai().embeddings.create(input=message, model=EMBEDDING_MODEL)
        embedding = embedding_response.data[0].embedding

        intent = predict_intent(embedding)
        logger.debug(
            "Intent detected",
            extra={"intent": intent, "course_name": course_name, "model": model},
        )

        normalized_query = normalize_query(message)
        query_id = str(uuid4())

        match intent:
            case Intent.GENERAL.value:
                from endpoints import general_query

                return general_query.chat(
                    connection_id,
                    domain_name,
                    stage,
                    message,
                    normalized_query,
                    course_name,
                    model,
                    prioritize_instructor,
                    embedding,
                    intent,
                    query_id,
                    user_id,
                )
            case Intent.SUMMARIZE.value:
                from endpoints import summarize

                return summarize.chat(
                    connection_id,
                    domain_name,
                    stage,
                    message,
                    normalized_query,
                    course_name,
                    model,
                    embedding,
                    intent,
                    query_id,
                    user_id,
                )
            case Intent.OVERVIEW.value:
                from endpoints import overview

                return overview.chat(
                    connection_id,
                    domain_name,
                    stage,
                    message,
                    normalized_query,
                    course_name,
                    model,
                    prioritize_instructor,
                    embedding,
                    intent,
                    query_id,
                    user_id,
                )
            case _:
                logger.warning(
                    "Unknown intent", extra={"intent": intent, "connection_id": connection_id}
                )
                return {"statusCode": 200}

    except Exception:
        logger.exception(
            "Error in lambda_handler",
            extra={"connection_id": connection_id, "domain_name": domain_name, "stage": stage},
        )

        if domain_name and stage and connection_id:
            try:
                apigw_management = apigw(domain_name, stage)

                send_websocket_message(
                    apigw_management,
                    connection_id,
                    {
                        "message": "An error occurred while processing your request. Please try again later.",
                        "type": WebSocketType.CHUNK.value,
                    },
                )

                send_websocket_message(
                    apigw_management,
                    connection_id,
                    {"message": "Finished streaming", "type": WebSocketType.DONE.value},
                )
            except Exception:
                logger.exception(
                    "Failed to send error message via WebSocket",
                    extra={"connection_id": connection_id},
                )

        return {"statusCode": 500, "body": json.dumps({"error": "Internal server error"})}
