import boto3
from functools import lru_cache
from utils.constants import SECRETS, AWS_REGION_NAME
from utils.utils import get_secret_api_key
from openai import OpenAI
from pinecone import Pinecone

@lru_cache(maxsize=None)
def dynamo():
    return boto3.resource("dynamodb")

@lru_cache(maxsize=None)
def secrets_manager():
    return boto3.client("secretsmanager", region_name=AWS_REGION_NAME)

@lru_cache(maxsize=None)
def openai():
    openai_api_key = get_secret_api_key(secrets_manager(), SECRETS['OPENAI'])
    return OpenAI(api_key=openai_api_key)

@lru_cache(maxsize=None)
def pinecone():
    pinecone_api_key = get_secret_api_key(secrets_manager(), SECRETS['PINECONE'])
    return Pinecone(api_key=pinecone_api_key, environment="us-west1-gcp")

@lru_cache(maxsize=None)
def apigw(domain_name: str, stage: str):
    return boto3.client(
        "apigatewaymanagementapi",
        endpoint_url=f"https://{domain_name}/{stage}"
    )
