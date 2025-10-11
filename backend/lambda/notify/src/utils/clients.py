import boto3
from pinecone import Pinecone
from functools import lru_cache
from utils.constants import AWS_REGION_NAME, SECRETS
from utils.utils import get_secret_api_key

@lru_cache(maxsize=None)
def secrets_manager():
    return boto3.client("secretsmanager", region_name=AWS_REGION_NAME)

@lru_cache(maxsize=None)
def pinecone():
    pinecone_api_key = get_secret_api_key(secrets_manager(), SECRETS['PINECONE'])
    return Pinecone(api_key=pinecone_api_key, environment="us-west1-gcp")