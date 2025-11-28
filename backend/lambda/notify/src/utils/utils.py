from botocore.exceptions import ClientError
from utils.logger import logger

def get_secret_api_key(client, secret_name: str) -> str:
    """Retrieve API key from AWS Parameter Store."""
    try:
        logger.debug("Retrieving secret from Parameter Store", extra={"secret_name": secret_name})
        response = client.get_parameter(
            Name=secret_name,
            WithDecryption=True
        )
        logger.debug("Successfully retrieved secret from Parameter Store", extra={"secret_name": secret_name})
        return response['Parameter']['Value']
    except ClientError as e:
        logger.exception("Failed to retrieve credentials from Parameter Store", extra={"secret_name": secret_name})
        raise RuntimeError(f"Failed to retrieve credentials from Parameter Store: {e}")
    except Exception as e:
        logger.exception("Unexpected error retrieving secret", extra={"secret_name": secret_name})
        raise