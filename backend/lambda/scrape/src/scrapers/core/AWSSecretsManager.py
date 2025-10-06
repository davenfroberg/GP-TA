import boto3
import json
from botocore.exceptions import ClientError
from config.constants import AWS_REGION_NAME, SECRETS

class AWSSecretsManager:
    """Handles AWS Secrets Manager operations"""
    def __init__(self):
        self.session = boto3.session.Session()
        self.client = self.session.client(
            service_name='secretsmanager',
            region_name=AWS_REGION_NAME
        )

    def get_secret_api_key(self, secret_name):
        """Get API key from AWS Secrets Manager"""
        try:
            response = self.client.get_secret_value(SecretId='api_keys')
            secret_dict = json.loads(response['SecretString'])
            return secret_dict[secret_name]
        except ClientError as e:
            print(f"Error retrieving secret: {e}")
            raise
        except Exception as e:
            print(f"Unexpected error: {e}")
            raise

    def get_piazza_credentials(self, secret_name=SECRETS['PIAZZA']):
        """Get Piazza username and password from AWS Secrets Manager"""
        try:
            response = self.client.get_secret_value(SecretId=secret_name)
            secret_dict = json.loads(response['SecretString'])
            username = secret_dict['username']
            password = secret_dict['password']
            print("Successfully retrieved Piazza credentials from AWS secrets manager")
            return username, password
        except ClientError as e:
            print(f"Error retrieving secret: {e}")
            raise
        except Exception as e:
            print(f"Unexpected error: {e}")
            raise