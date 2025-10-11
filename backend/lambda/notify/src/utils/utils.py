import json
from botocore.exceptions import ClientError

def get_secret_api_key(client, secret_name: str) -> str:
    """Retrieve API key from AWS Secrets Manager."""
    try:
        response = client.get_secret_value(SecretId='api_keys')
        secret_dict = json.loads(response['SecretString'])
        return secret_dict[secret_name]
    except ClientError as e:
        print(f"Error retrieving secret: {e}")
        raise
    except Exception as e:
        print(f"Unexpected error: {e}")
        raise