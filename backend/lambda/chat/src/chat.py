import boto3
import json
import os

lambda_client = boto3.client("lambda")

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

    # TODO: Run intent detection here
    intent = "chat"  # placeholder result

    if intent == "chat":
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

    return {"statusCode": 200}