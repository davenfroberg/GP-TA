import json
import boto3
from botocore.exceptions import ClientError
from openai import OpenAI

# Configuration Constants
SECRETS = {
    "OPENAI": "openai"
}
AWS_REGION_NAME = "us-west-2"
# Initialize clients at module level for reuse across invocations
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
        response = client.get_secret_value(SecretId='api_keys')
        secret_dict = json.loads(response['SecretString'])
        return secret_dict[secret_name]
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

def create_system_prompt() -> str:
    """Create the system prompt for the OpenAI model."""

    return (
        "Write a concise, casual post for a class Q&A (Piazza) board, as if you were the student writing the post.\n\n"
        "Requirements:\n"
        "- Reword the student’s question to be more precise and detailed and ask for clarification.\n"
        "- Mention if you already checked Piazza/notes/etc. but didn’t find a clear answer.\n"
        "- Do not start with a greeting.\n"
        "- Keep it 2–4 sentences, conversational, not professional or AI-like.\n"
        "- Be respectful and polite, but not overly formal.\n"
        "- Use inline code formatting only for function names or code identifiers.\n"
        "- No lists, no formal closings, no signatures.\n\n"
        "Tone:\n"
        "- Sound like a real student: informal, direct, a bit skeptical.\n\n"
        "Output Format:\n"
        "- JSON with two fields: 'post_content' (the post text) and 'post_title' (a concise title for the post).\n\n"
        "Example Formatting:\n"
        '{\n'
        '  "post_title": "Clarification on Homework 2 Release?",\n'
        '  "post_content": "Hey, I saw some posts about Homework 2 but couldn’t find a clear answer. Has it been released yet, or is it still pending? I checked Piazza and the course notes but didn’t see anything definitive." \n'
        '}\n'
    )
def lambda_handler(event, context):
    try:
        # Parse request data
        event_body = event.get("body")
        if not event_body:
            raise ValueError("No body in request")
        
        data = json.loads(event_body)
        llm_attempt = data.get("llm_attempt", "The LLM did not respond.")
        original_question = data.get("original_question", "No original question provided.")
        additional_context = data.get("additional_context", "No additional context provided.")


        prompt = f"Assitant's Attempt At Answering:\n{llm_attempt}\n\nAdditional Provided Context:\n{additional_context}\n\nStudent's Original Question: {original_question}\nAnswer:"
        
        openai_client = get_openai_client()
        response = openai_client.responses.create(
            model="gpt-5",
            reasoning={"effort": "minimal"},
            instructions=create_system_prompt(),
            input=prompt
        )

        response_text = response.output[1].content[0].text
        generated_title = json.loads(response_text).get("post_title", "No title generated")
        generated_body = json.loads(response_text).get("post_content", "No content generated")
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({
                "post_title": generated_title,
                "post_content": generated_body
            }),
        }

    except Exception as e:
        print(f"Error processing request: {e}")
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": str(e)})
        }

if __name__ == "__main__":
    event = {
        "body": json.dumps({
            
            "llm_attempt": """
                Short answer: Not yet confirmed as released.
                The most recent Piazza posts indicate that PIKA 6 may be skipped this term or there may be an in-class PIKA on Friday.
                Instructor update: They’re tentatively planning to do a PIKA in class on Friday, which could replace the pre-class reading PIKA. Any outside-of-class PIKA would have more than one day to complete.
                If you need a definitive confirmation and Piazza doesn’t show a release post for PIKA 6, would you like me to create a post asking the instructors for the official status?""",
            "original_question": "is pika 6 out yet?",
            "additional_context": ""
        })
    }
    lambda_handler(event, None)