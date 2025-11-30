from botocore.exceptions import ClientError
from utils.logger import logger


def get_secret_api_key(client, secret_name: str) -> str:
    """Retrieve API key from AWS Parameter Store."""
    try:
        response = client.get_parameter(Name=secret_name, WithDecryption=True)
        return response["Parameter"]["Value"]
    except ClientError as e:
        logger.error(
            "Failed to retrieve credentials from Parameter Store",
            extra={"secret_name": secret_name, "error": str(e)},
        )
        raise RuntimeError(f"Failed to retrieve credentials from Parameter Store: {e}") from e
    except Exception:
        logger.exception("Unexpected error retrieving secret", extra={"secret_name": secret_name})
        raise
