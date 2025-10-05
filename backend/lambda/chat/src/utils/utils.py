import json
from typing import Dict
from botocore.exceptions import ClientError

def get_secret_api_key(client, secret_name: str) -> str:
    """Retrieve API key from AWS Secrets Manager."""
    try:
        response = client.get_secret_value(SecretId=secret_name)
        secret_dict = json.loads(response['SecretString'])
        return secret_dict['api_key']
    except ClientError as e:
        print(f"Error retrieving secret: {e}")
        raise
    except Exception as e:
        print(f"Unexpected error: {e}")
        raise

def send_websocket_message(apigw_management, connection_id: str, message_data: Dict) -> None:
    """Send a message through the WebSocket connection."""
    try:
        apigw_management.post_to_connection(
            Data=json.dumps(message_data),
            ConnectionId=connection_id
        )
    except Exception as e:
        print(f"Error sending WebSocket message: {e}")
        raise
