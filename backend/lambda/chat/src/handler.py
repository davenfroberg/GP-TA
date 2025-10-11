import json
from predict_intent import predict_intent # type: ignore ; b/c this is in lambda layer
from endpoints import general_query, summarize, overview
from utils.clients import apigw
from utils.utils import send_websocket_message, normalize_query
from enums.Intent import Intent
from enums.WebSocketType import WebSocketType

from utils.clients import openai

def lambda_handler(event, context):
    """
    Intent detection lambda.
    Decides what to do with the incoming message.
    """
    try:
        connection_id = event["requestContext"]["connectionId"]
        domain_name = event["requestContext"]["domainName"]
        stage = event["requestContext"]["stage"]

        body = json.loads(event.get("body", "{}"))
        message = body.get("message")
        class_name = body.get("class")
        model = body.get("model", "gpt-5")
        prioritize_instructor = body.get("prioritizeInstructor", False)

        if not message:
            raise ValueError("Message is required")
        
        client = openai()
        embedding_response = client.embeddings.create(
            input=message,
            model="text-embedding-3-small"
        )
        embedding = embedding_response.data[0].embedding
        
        intent = predict_intent(embedding)
        print("Intent: ", intent)
        
        normalized_query = normalize_query(message)

        match intent:
            case Intent.GENERAL.value:
                return general_query.chat(connection_id, domain_name, stage, normalized_query, class_name, model, prioritize_instructor)
            case Intent.SUMMARIZE.value:
                return summarize.chat(connection_id, domain_name, stage, normalized_query, class_name, model, prioritize_instructor)
            case Intent.OVERVIEW.value:
                return overview.chat(connection_id, domain_name, stage, normalized_query, class_name, model, prioritize_instructor)
            case _:
                return {
                    "statusCode": 200
                }   
        
    except Exception as e:
        print(f"Error getting embedding or predicting intent: {e}")
        apigw_management = apigw(domain_name, stage)
        
        send_websocket_message(apigw_management, connection_id, {
            "message": "An error occurred while processing your request. Please try again later.",
            "type": WebSocketType.CHUNK.value
        })

        send_websocket_message(apigw_management, connection_id, {
            "message": "Finished streaming",
            "type": WebSocketType.DONE.value
        })

        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)})
        }  
