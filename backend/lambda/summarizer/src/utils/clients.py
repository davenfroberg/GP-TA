from functools import cache
from typing import Any

import boto3
from openai import OpenAI
from utils.constants import AWS_REGION_NAME, SECRETS
from utils.utils import get_secret_api_key


@cache
def dynamo() -> Any:
    return boto3.resource("dynamodb")


@cache
def ssm_manager() -> Any:
    return boto3.client("ssm", region_name=AWS_REGION_NAME)


@cache
def openai() -> OpenAI:
    openai_api_key = get_secret_api_key(ssm_manager(), SECRETS["OPENAI"])
    return OpenAI(api_key=openai_api_key)
