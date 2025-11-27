import boto3
from functools import lru_cache
from utils.constants import SECRETS, AWS_REGION_NAME
from utils.utils import get_secret_api_key
from openai import OpenAI

@lru_cache(maxsize=None)
def dynamo():
    return boto3.resource("dynamodb")

@lru_cache(maxsize=None)
def ssm_manager():
    return boto3.client("ssm", region_name=AWS_REGION_NAME)

@lru_cache(maxsize=None)
def openai():
    openai_api_key = get_secret_api_key(ssm_manager(), SECRETS['OPENAI'])
    return OpenAI(api_key=openai_api_key)