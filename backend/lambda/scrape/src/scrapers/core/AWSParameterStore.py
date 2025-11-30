import boto3
from botocore.exceptions import ClientError
from config.constants import AWS_REGION_NAME, SECRETS
from config.logger import logger


class AWSParameterStore:
    """Handles AWS Parameter Store operations"""

    def __init__(self):
        self.session = boto3.session.Session()
        self.client = self.session.client(service_name="ssm", region_name=AWS_REGION_NAME)

    def get_secret_api_key(self, secret_name):
        """Retrieve API key from AWS Parameter Store."""
        try:
            response = self.client.get_parameter(Name=secret_name, WithDecryption=True)
            return response["Parameter"]["Value"]
        except ClientError as e:
            logger.exception("Failed to retrieve secret", extra={"secret_name": secret_name})
            raise RuntimeError(f"Failed to retrieve credentials from Parameter Store: {e}") from e
        except Exception:
            logger.exception(
                "Unexpected error retrieving secret", extra={"secret_name": secret_name}
            )
            raise

    def get_piazza_credentials(
        self, username_secret=SECRETS["PIAZZA_USER"], password_secret=SECRETS["PIAZZA_PASS"]
    ):
        """Get Piazza username and password from AWS Parameter Store"""
        try:
            username_response = self.client.get_parameter(Name=username_secret, WithDecryption=True)
            password_response = self.client.get_parameter(Name=password_secret, WithDecryption=True)
            username = username_response["Parameter"]["Value"]
            password = password_response["Parameter"]["Value"]

            logger.info("Retrieved Piazza credentials from Parameter Store")
            return username, password
        except ClientError:
            logger.exception("Failed to retrieve Piazza credentials from Parameter Store")
            raise
        except Exception:
            logger.exception("Unexpected error retrieving Piazza credentials")
            raise
