import json

import boto3
from botocore.exceptions import ClientError
from openai import OpenAI
from utils.logger import logger

# Configuration Constants
SECRETS = {"OPENAI": "open_ai_key"}
AWS_REGION_NAME = "us-west-2"
# Initialize clients at module level for reuse across invocations
_secrets_client = None
_openai_client = None


def get_ssm_client():
    """Get or create Systems Manager Client."""
    global _secrets_client
    if _secrets_client is None:
        _secrets_client = boto3.client(service_name="ssm", region_name=AWS_REGION_NAME)
    return _secrets_client


def get_secret_api_key(secret_name: str) -> str:
    """Retrieve API key from AWS Parameter Store."""
    client = get_ssm_client()

    try:
        logger.debug("Retrieving secret from Parameter Store", extra={"secret_name": secret_name})
        response = client.get_parameter(Name=secret_name, WithDecryption=True)
        logger.debug(
            "Successfully retrieved secret from Parameter Store", extra={"secret_name": secret_name}
        )
        return response["Parameter"]["Value"]
    except ClientError as e:
        logger.exception(
            "Failed to retrieve credentials from Parameter Store",
            extra={"secret_name": secret_name},
        )
        raise RuntimeError(f"Failed to retrieve credentials from Parameter Store: {e}") from e
    except Exception:
        logger.exception("Unexpected error retrieving secret", extra={"secret_name": secret_name})
        raise


def get_openai_client():
    """Get or create OpenAI client."""
    global _openai_client
    if _openai_client is None:
        logger.debug("Initializing OpenAI client")
        openai_api_key = get_secret_api_key(SECRETS["OPENAI"])
        _openai_client = OpenAI(api_key=openai_api_key)
        logger.debug("OpenAI client initialized successfully")
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
        "{\n"
        '  "post_title": "Clarification on Homework 2 Release?",\n'
        '  "post_content": "Hey, I saw some posts about Homework 2 but couldn’t find a clear answer. Has it been released yet, or is it still pending? I checked Piazza and the course notes but didn’t see anything definitive." \n'
        "}\n"
    )


@logger.inject_lambda_context(log_event=True)
def lambda_handler(event, context):
    try:
        logger.info("Processing generate-post request")

        # Parse request data
        event_body = event.get("body")
        if not event_body:
            logger.warning("Missing request body")
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Request body is required"}),
            }

        try:
            data = json.loads(event_body)
        except json.JSONDecodeError:
            logger.exception("Failed to parse request body as JSON")
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Invalid JSON in request body"}),
            }

        llm_attempt = data.get("llm_attempt", "The LLM did not respond.")
        original_question = data.get("original_question", "No original question provided.")
        additional_context = data.get("additional_context", "No additional context provided.")

        if not original_question or original_question == "No original question provided.":
            logger.warning("Missing or invalid original_question")
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "original_question is required"}),
            }

        logger.info(
            "Generating post",
            extra={
                "has_llm_attempt": bool(llm_attempt),
                "has_additional_context": bool(additional_context),
                "original_question_length": len(original_question),
            },
        )

        prompt = f"Assitant's Attempt At Answering:\n{llm_attempt}\n\nAdditional Provided Context:\n{additional_context}\n\nStudent's Original Question: {original_question}\nAnswer:"

        try:
            openai_client = get_openai_client()
            logger.debug("Calling OpenAI API to generate post")
            response = openai_client.responses.create(
                model="gpt-5",
                reasoning={"effort": "minimal"},
                instructions=create_system_prompt(),
                input=prompt,
            )
            logger.debug("Received response from OpenAI API")
        except Exception:
            logger.exception("Failed to call OpenAI API")
            return {
                "statusCode": 500,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Failed to generate post"}),
            }

        try:
            response_text = response.output[1].content[0].text
            parsed_response = json.loads(response_text)
            generated_title = parsed_response.get("post_title", "No title generated")
            generated_body = parsed_response.get("post_content", "No content generated")

            logger.info(
                "Successfully generated post",
                extra={
                    "has_title": bool(generated_title),
                    "has_content": bool(generated_body),
                    "title_length": len(generated_title) if generated_title else 0,
                    "content_length": len(generated_body) if generated_body else 0,
                },
            )
        except (KeyError, IndexError, json.JSONDecodeError):
            logger.exception(
                "Failed to parse OpenAI response", extra={"response_structure": str(response)}
            )
            return {
                "statusCode": 500,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Failed to parse generated post"}),
            }

        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"post_title": generated_title, "post_content": generated_body}),
        }

    except Exception:
        logger.exception("Unexpected error in lambda_handler")
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "Internal server error"}),
        }
