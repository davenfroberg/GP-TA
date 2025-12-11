from auth_utils import verify_cognito_jwt  # pyright: ignore[reportMissingImports]; b/c in layer
from utils.logger import logger


@logger.inject_lambda_context(log_event=True)
def lambda_handler(event: dict, context: dict) -> dict:
    connection_id = event.get("requestContext", {}).get("connectionId", "unknown")

    try:
        logger.info(
            "WebSocket $connect request",
            extra={
                "connection_id": connection_id,
                "has_query_params": bool(event.get("queryStringParameters")),
                "has_headers": bool(event.get("headers")),
            },
        )

        query_params = event.get("queryStringParameters") or {}
        token = query_params.get("token")

        # Fallback: try Authorization header if token not in query params
        if not token:
            headers = event.get("headers") or {}
            auth_header = headers.get("Authorization") or headers.get("authorization")
            if auth_header and auth_header.startswith("Bearer "):
                token = auth_header.replace("Bearer ", "")

        if not token:
            logger.warning("Missing authentication token", extra={"connection_id": connection_id})
            return {
                "statusCode": 401,
            }

        try:
            claims = verify_cognito_jwt(token)
            user_id = claims.get("sub")
            logger.info(
                "WebSocket connection authorized",
                extra={
                    "user_id": user_id,
                    "connection_id": connection_id,
                },
            )

            return {"statusCode": 200}

        except ValueError as e:
            logger.warning(
                "Invalid JWT token",
                extra={
                    "error": str(e),
                    "connection_id": connection_id,
                },
            )
            return {
                "statusCode": 401,
            }
        except Exception as e:
            logger.exception(
                "Error verifying JWT token",
                extra={
                    "error": str(e),
                    "connection_id": connection_id,
                },
            )
            return {
                "statusCode": 500,
            }

    except Exception as e:
        logger.exception(
            "Unexpected error in $connect handler",
            extra={
                "error": str(e),
                "connection_id": connection_id,
            },
        )
        return {
            "statusCode": 500,
        }
