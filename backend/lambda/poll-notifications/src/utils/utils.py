from botocore.exceptions import ClientError

def get_secret_api_key(client, secret_name: str) -> str:
    """Retrieve API key from AWS Parameter Store."""
    try:
        response = client.get_parameter(
            Name=secret_name,
            WithDecryption=True
        )
        return response['Parameter']['Value']
    except ClientError as e:
        raise RuntimeError(f"Failed to retrieve credentials from Parameter Store: {e}")
    except Exception as e:
        print(f"Unexpected error: {e}")
        raise