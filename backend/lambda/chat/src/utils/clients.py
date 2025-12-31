from functools import cache

import boto3
from openai import OpenAI
from pinecone import Pinecone

from utils.constants import AWS_REGION_NAME, SECRETS
from utils.utils import get_secret_api_key


@cache
def dynamo() -> boto3.resource:
    return boto3.resource("dynamodb")


@cache
def ssm_manager() -> boto3.client:
    return boto3.client("ssm", region_name=AWS_REGION_NAME)


@cache
def openai() -> OpenAI:
    openai_api_key = get_secret_api_key(ssm_manager(), SECRETS["OPENAI"])
    return OpenAI(api_key=openai_api_key)


@cache
def pinecone() -> Pinecone:
    pinecone_api_key = get_secret_api_key(ssm_manager(), SECRETS["PINECONE"])
    return Pinecone(api_key=pinecone_api_key, environment="us-west1-gcp")


@cache
def apigw(domain_name: str, stage: str) -> boto3.client:
    return boto3.client("apigatewaymanagementapi", endpoint_url=f"https://{domain_name}/{stage}")
