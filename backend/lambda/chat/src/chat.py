import boto3
import json
import os
from predict_intent import predict_intent # this is in lambda layer
from openai import OpenAI
from botocore.exceptions import ClientError

lambda_client = boto3.client("lambda")

SECRETS = {
    "OPENAI": "openai"
}
AWS_REGION_NAME = "us-west-2"

_secrets_client = None
_openai_client = None

def get_secrets_client():
    """Get or create Secrets Manager client."""
    global _secrets_client
    if _secrets_client is None:
        _secrets_client = boto3.client(
            service_name='secretsmanager',
            region_name=AWS_REGION_NAME
        )
    return _secrets_client


def get_secret_api_key(secret_name: str) -> str:
    """Retrieve API key from AWS Secrets Manager."""
    client = get_secrets_client()
    
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

def get_openai_client():
    """Get or create OpenAI client."""
    global _openai_client
    if _openai_client is None:
        openai_api_key = get_secret_api_key(SECRETS['OPENAI'])
        _openai_client = OpenAI(api_key=openai_api_key)
    return _openai_client

def lambda_handler(event, context):
    """
    Intent detection lambda.
    Decides what to do with the incoming message.
    """
    # Extract connection info from API Gateway event
    connection_id = event["requestContext"]["connectionId"]
    domain_name = event["requestContext"]["domainName"]
    stage = event["requestContext"]["stage"]

    # Parse body
    body = json.loads(event.get("body", "{}"))
    message = body.get("message")
    class_name = body.get("class")
    model = body.get("model", "gpt-5")
    prioritize_instructor = body.get("prioritizeInstructor", False)

    # Validate message
    if not message:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "Message is required"})
        }

    # Initialize OpenAI client
    client = get_openai_client()
    
    # Get embedding from OpenAI
    try:
        embedding_response = client .embeddings.create(
            input=message,
            model="text-embedding-3-small"
        )
        # Extract the embedding vector from the response
        embedding = embedding_response.data[0].embedding
        
        # Pass the embedding to predict_intent
        intent = predict_intent(embedding)
        print("Intent: ", intent)
        
    except Exception as e:
        print(f"Error getting embedding or predicting intent: {e}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "Failed to process message"})
        }
    if intent == "general":
        payload = {
            "connection_id": connection_id,
            "domain_name": domain_name,
            "stage": stage,
            "query": message,
            "class": class_name,
            "model": model,
            "prioritize_instructor": prioritize_instructor
        }

        response = lambda_client.invoke(
            FunctionName="general-query",
            InvocationType="Event",  # async
            Payload=json.dumps(payload)
        )
        return {
            "statusCode": 200
        }
    
    return {
        "statusCode": 500
    }