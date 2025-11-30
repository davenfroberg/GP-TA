from functools import cache

import boto3
from pinecone import Pinecone
from utils.constants import AWS_REGION_NAME, SECRETS
from utils.utils import get_secret_api_key


@cache
def ssm():
    return boto3.client("ssm", region_name=AWS_REGION_NAME)


@cache
def pinecone():
    pinecone_api_key = get_secret_api_key(ssm(), SECRETS["PINECONE"])
    return Pinecone(api_key=pinecone_api_key, environment="us-west1-gcp")
