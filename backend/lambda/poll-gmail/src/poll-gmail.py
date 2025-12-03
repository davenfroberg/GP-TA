import base64
import json
import re
from urllib.parse import parse_qs, urlparse

import boto3
import requests
from botocore.exceptions import ClientError
from utils.logger import logger


class Config:
    """Configuration constants for the application."""

    SECRET_NAME = "gmail_token"
    REGION_NAME = "us-west-2"
    LABEL_NAME = "piazza-project"
    SQS_QUEUE_URL = "https://sqs.us-west-2.amazonaws.com/112745307245/PiazzaUpdateQueue"
    GMAIL_TABLE_NAME = "gmail-messages"

    # Gmail API endpoints
    GMAIL_LABELS_URL = "https://gmail.googleapis.com/gmail/v1/users/me/labels"
    GMAIL_MESSAGES_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages"
    OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"


class AWSService:
    """Handles AWS service interactions."""

    def __init__(self):
        self.ssm_client = boto3.client("ssm")
        self.dynamodb = boto3.client("dynamodb")
        self.sqs = boto3.client("sqs")

    def get_gmail_credentials(self) -> dict[str, str]:
        """Fetch Gmail OAuth credentials from AWS Systems Manager Parameter Store."""
        try:
            response = self.ssm_client.get_parameter(Name=Config.SECRET_NAME, WithDecryption=True)
            logger.debug("Successfully retrieved Gmail credentials from Parameter Store")
            return json.loads(response["Parameter"]["Value"])
        except ClientError as e:
            logger.exception(
                "Failed to retrieve credentials from Parameter Store",
                extra={"secret_name": Config.SECRET_NAME},
            )
            raise RuntimeError(f"Failed to retrieve credentials from Parameter Store: {e}") from e

    def is_message_processed(self, message_id: str) -> bool:
        """Check if a Gmail message has already been processed."""
        try:
            response = self.dynamodb.get_item(
                TableName=Config.GMAIL_TABLE_NAME, Key={"gmail_message_id": {"S": message_id}}
            )

            if "Item" in response:
                return True  # Message already exists

            self.dynamodb.put_item(
                TableName=Config.GMAIL_TABLE_NAME, Item={"gmail_message_id": {"S": message_id}}
            )
            return False  # Message is new

        except ClientError as e:
            logger.exception(
                "DynamoDB error checking message",
                extra={"message_id": message_id, "table_name": Config.GMAIL_TABLE_NAME},
            )
            raise RuntimeError(f"DynamoDB error: {e}") from e

    def send_to_queue(self, post_id: str, course_id: str) -> None:
        """Send Piazza post information to SQS queue."""
        payload = {"post_id": post_id, "course_id": course_id}

        try:
            logger.info(
                "Sending message to SQS queue",
                extra={
                    "post_id": post_id,
                    "course_id": course_id,
                    "queue_url": Config.SQS_QUEUE_URL,
                },
            )
            self.sqs.send_message(QueueUrl=Config.SQS_QUEUE_URL, MessageBody=json.dumps(payload))
        except ClientError as e:
            logger.exception(
                "Failed to send message to SQS",
                extra={
                    "post_id": post_id,
                    "course_id": course_id,
                    "queue_url": Config.SQS_QUEUE_URL,
                },
            )
            raise RuntimeError(f"Failed to send message to SQS: {e}") from e


class GmailService:
    """Handles Gmail API interactions."""

    def __init__(self, aws_service: AWSService):
        self.aws_service = aws_service
        self.access_token = None

    def authenticate(self) -> None:
        """Authenticate with Gmail using OAuth refresh token."""
        credentials = self.aws_service.get_gmail_credentials()
        self.access_token = self._refresh_access_token(
            credentials["client_id"], credentials["client_secret"], credentials["refresh_token"]
        )
        logger.info("Successfully authenticated with Gmail API")

    def _refresh_access_token(self, client_id: str, client_secret: str, refresh_token: str) -> str:
        """Exchange refresh token for a new access token."""
        payload = {
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }

        try:
            response = requests.post(Config.OAUTH_TOKEN_URL, data=payload)
            response.raise_for_status()
            logger.debug("Successfully refreshed Gmail access token")
            return response.json()["access_token"]
        except requests.RequestException as e:
            logger.exception(
                "Failed to refresh access token", extra={"token_url": Config.OAUTH_TOKEN_URL}
            )
            raise RuntimeError(f"Failed to refresh access token: {e}") from e

    def _get_headers(self) -> dict[str, str]:
        """Get authorization headers for Gmail API requests."""
        if not self.access_token:
            raise RuntimeError("Not authenticated. Call authenticate() first.")
        return {"Authorization": f"Bearer {self.access_token}"}

    def get_label_id(self, label_name: str) -> str:
        """Find Gmail label ID by name."""
        try:
            logger.info("Fetching Gmail label ID", extra={"label_name": label_name})
            response = requests.get(Config.GMAIL_LABELS_URL, headers=self._get_headers())
            response.raise_for_status()

            labels = response.json().get("labels", [])
            for label in labels:
                if label["name"] == label_name:
                    return label["id"]

            logger.error("Gmail label not found", extra={"label_name": label_name})
            raise ValueError(f"Label '{label_name}' not found")
        except requests.RequestException as e:
            logger.exception(
                "Failed to get label ID from Gmail API", extra={"label_name": label_name}
            )
            raise RuntimeError(f"Failed to get label ID: {e}") from e

    def get_messages_by_label(self, label_id: str) -> list[dict]:
        """Retrieve all messages with the specified label, handling pagination."""
        messages = []
        params = {"labelIds": label_id, "maxResults": 100}
        page_count = 0

        logger.info("Fetching messages by label", extra={"label_id": label_id})

        while True:
            try:
                page_count += 1
                response = requests.get(
                    Config.GMAIL_MESSAGES_URL, headers=self._get_headers(), params=params
                )
                response.raise_for_status()
                data = response.json()

                page_messages = data.get("messages", [])
                messages.extend(page_messages)
                logger.debug(
                    "Fetched page of messages",
                    extra={
                        "label_id": label_id,
                        "page": page_count,
                        "messages_in_page": len(page_messages),
                        "total_messages": len(messages),
                    },
                )

                next_page_token = data.get("nextPageToken")
                if not next_page_token:
                    break

                params["pageToken"] = next_page_token

            except requests.RequestException as e:
                logger.exception(
                    "Failed to retrieve messages from Gmail API",
                    extra={"label_id": label_id, "page": page_count},
                )
                raise RuntimeError(f"Failed to retrieve messages: {e}") from e

        return messages

    def get_message_details(self, message_id: str) -> dict:
        """Get full message details from Gmail API."""
        try:
            logger.debug(
                "Fetching message details from Gmail API", extra={"message_id": message_id}
            )
            url = f"{Config.GMAIL_MESSAGES_URL}/{message_id}"
            response = requests.get(url, headers=self._get_headers())
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            logger.exception(
                "Failed to get message details from Gmail API", extra={"message_id": message_id}
            )
            raise RuntimeError(f"Failed to get message details: {e}") from e


class PiazzaMessageParser:
    """Handles parsing of Piazza-related information from Gmail messages."""

    @staticmethod
    def extract_message_body(payload: dict) -> str | None:
        """Extract plain text body from Gmail message payload."""
        # Check if body is directly available
        if "body" in payload and "data" in payload["body"]:
            return PiazzaMessageParser._decode_base64_content(payload["body"]["data"])

        # Check message parts for plain text
        if "parts" in payload:
            for part in payload["parts"]:
                if part["mimeType"] == "text/plain" and "body" in part and "data" in part["body"]:
                    return PiazzaMessageParser._decode_base64_content(part["body"]["data"])

        return None

    @staticmethod
    def _decode_base64_content(data: str) -> str:
        """Decode base64-encoded message content."""
        try:
            decoded_bytes = base64.urlsafe_b64decode(data.encode("UTF-8"))
            return decoded_bytes.decode("UTF-8")
        except Exception as e:
            raise ValueError(f"Failed to decode message content: {e}") from e

    @staticmethod
    def extract_piazza_ids(payload: dict) -> tuple[str | None, str | None]:
        """Extract Piazza post and course IDs from message payload."""
        body = PiazzaMessageParser.extract_message_body(payload)
        if not body:
            return None, None

        # Extract the Piazza view link
        match = re.search(r"Click here<([^>]+)> to view", body)
        if not match:
            return None, None

        view_link = match.group(1)
        parsed_url = urlparse(view_link)
        query_params = parse_qs(parsed_url.query)

        post_id = query_params.get("cid", [None])[0]
        course_id = query_params.get("nid", [None])[0]

        return post_id, course_id


class PiazzaGmailProcessor:
    """Main processor for handling Piazza notifications from Gmail."""

    def __init__(self):
        self.aws_service = AWSService()
        self.gmail_service = GmailService(self.aws_service)
        self.parser = PiazzaMessageParser()

    def process_messages(self) -> dict[str, any]:
        """Process all new Piazza messages from Gmail."""
        # Authenticate and get label
        self.gmail_service.authenticate()
        label_id = self.gmail_service.get_label_id(Config.LABEL_NAME)

        # Get all messages with the label
        messages = self.gmail_service.get_messages_by_label(label_id)
        logger.info(
            "Found messages under label",
            extra={
                "label_name": Config.LABEL_NAME,
                "label_id": label_id,
                "total_messages": len(messages),
            },
        )

        # Filter out already processed messages and deduplicate by thread
        new_messages = self._filter_new_messages(messages)
        logger.info(
            "Filtered new messages",
            extra={
                "label_name": Config.LABEL_NAME,
                "new_message_count": len(new_messages),
                "total_messages": len(messages),
            },
        )

        # Process each new message
        processed_count = 0
        failed_count = 0
        for message in new_messages:
            try:
                self._process_single_message(message)
                processed_count += 1
            except Exception:
                failed_count += 1
                logger.exception(
                    "Error processing message",
                    extra={"message_id": message.get("id"), "thread_id": message.get("threadId")},
                )

        logger.info(
            "Completed processing messages",
            extra={
                "label_name": Config.LABEL_NAME,
                "processed_count": processed_count,
                "failed_count": failed_count,
                "total_new_messages": len(new_messages),
            },
        )

        return {
            "statusCode": 200,
            "body": json.dumps(
                f"Processed {processed_count} new messages under label '{Config.LABEL_NAME}'"
            ),
        }

    def _filter_new_messages(self, messages: list[dict]) -> list[dict]:
        """Filter out already processed messages and deduplicate by thread."""
        processed_threads = set()
        new_messages = []
        skipped_processed = 0
        skipped_duplicate = 0

        for message in messages:
            message_id = message["id"]
            thread_id = message["threadId"]

            # Skip if message already processed
            if self.aws_service.is_message_processed(message_id):
                skipped_processed += 1
                continue

            # Skip if we've already seen this thread
            if thread_id in processed_threads:
                skipped_duplicate += 1
                continue

            processed_threads.add(thread_id)
            new_messages.append(message)

        logger.debug(
            "Filtered messages",
            extra={
                "total_messages": len(messages),
                "new_messages": len(new_messages),
                "skipped_processed": skipped_processed,
                "skipped_duplicate": skipped_duplicate,
            },
        )

        return new_messages

    def _process_single_message(self, message: dict) -> None:
        """Process a single Gmail message and send to SQS if it contains Piazza data."""
        message_id = message["id"]
        thread_id = message.get("threadId")

        # Get full message details
        full_message = self.gmail_service.get_message_details(message_id)

        # Extract Piazza IDs
        post_id, course_id = self.parser.extract_piazza_ids(full_message["payload"])

        if not post_id or not course_id:
            logger.warning(
                "Could not extract Piazza IDs from message",
                extra={"message_id": message_id, "thread_id": thread_id},
            )
            return

        # Send to SQS
        self.aws_service.send_to_queue(post_id, course_id)
        logger.info(
            "Queued Piazza post from Gmail message",
            extra={
                "message_id": message_id,
                "thread_id": thread_id,
                "post_id": post_id,
                "course_id": course_id,
            },
        )


@logger.inject_lambda_context(log_event=True)
def lambda_handler(event: dict, context: dict) -> dict:
    """AWS Lambda entry point."""
    try:
        processor = PiazzaGmailProcessor()
        result = processor.process_messages()
        logger.info("Poll-gmail lambda execution completed successfully")
        return result
    except Exception as e:
        logger.exception("Fatal error in lambda_handler")
        return {"statusCode": 500, "body": json.dumps(f"Error processing messages: {str(e)}")}
