import json
from typing import Dict

from botocore.exceptions import ClientError

from utils.logger import logger


def get_secret_api_key(client, secret_name: str) -> str:
    """Retrieve API key from AWS Parameter Store."""
    try:
        response = client.get_parameter(
            Name=secret_name,
            WithDecryption=True
        )
        return response['Parameter']['Value']
    except ClientError as e:
        logger.exception("Failed to retrieve credentials from Parameter Store", extra={"secret_name": secret_name})
        raise RuntimeError(f"Failed to retrieve credentials from Parameter Store: {e}")
    except Exception:
        logger.exception("Unexpected error retrieving secret", extra={"secret_name": secret_name})
        raise


def send_websocket_message(apigw_management, connection_id: str, message_data: Dict) -> None:
    """Send a message through the WebSocket connection."""
    try:
        apigw_management.post_to_connection(
            Data=json.dumps(message_data),
            ConnectionId=connection_id
        )
    except Exception:
        logger.exception("Error sending WebSocket message", extra={"connection_id": connection_id})
        raise