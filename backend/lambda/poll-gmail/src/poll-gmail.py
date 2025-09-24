import json
import base64
import re
from urllib.parse import urlparse, parse_qs
from typing import Dict, List, Optional, Tuple

import boto3
import requests
from botocore.exceptions import ClientError


class Config:
    """Configuration constants for the application."""
    SECRET_NAME = "gmail_new"
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
        self.secrets_manager = boto3.client('secretsmanager', region_name=Config.REGION_NAME)
        self.dynamodb = boto3.client('dynamodb')
        self.sqs = boto3.client('sqs')
    
    def get_gmail_credentials(self) -> Dict[str, str]:
        """Fetch Gmail OAuth credentials from AWS Secrets Manager."""
        try:
            response = self.secrets_manager.get_secret_value(SecretId=Config.SECRET_NAME)
            return json.loads(response['SecretString'])
        except ClientError as e:
            raise RuntimeError(f"Failed to retrieve credentials: {e}")
    
    def is_message_processed(self, message_id: str) -> bool:
        """Check if a Gmail message has already been processed."""
        try:
            self.dynamodb.put_item(
                TableName=Config.GMAIL_TABLE_NAME,
                Item={"gmail_message_id": {"S": message_id}},
                ConditionExpression="attribute_not_exists(gmail_message_id)"
            )
            return False  # Message is new
        except ClientError as e:
            if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
                return True  # Message already exists
            else:
                raise RuntimeError(f"DynamoDB error: {e}")
    
    def send_to_queue(self, post_id: str, course_id: str) -> None:
        """Send Piazza post information to SQS queue."""
        payload = {"post_id": post_id, "course_id": course_id}
        
        try:
            self.sqs.send_message(
                QueueUrl=Config.SQS_QUEUE_URL,
                MessageBody=json.dumps(payload)
            )
        except ClientError as e:
            raise RuntimeError(f"Failed to send message to SQS: {e}")


class GmailService:
    """Handles Gmail API interactions."""
    
    def __init__(self, aws_service: AWSService):
        self.aws_service = aws_service
        self.access_token = None
    
    def authenticate(self) -> None:
        """Authenticate with Gmail using OAuth refresh token."""
        credentials = self.aws_service.get_gmail_credentials()
        self.access_token = self._refresh_access_token(
            credentials["client_id"],
            credentials["client_secret"], 
            credentials["refresh_token"]
        )
    
    def _refresh_access_token(self, client_id: str, client_secret: str, refresh_token: str) -> str:
        """Exchange refresh token for a new access token."""
        payload = {
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token"
        }
        
        try:
            response = requests.post(Config.OAUTH_TOKEN_URL, data=payload)
            response.raise_for_status()
            return response.json()['access_token']
        except requests.RequestException as e:
            raise RuntimeError(f"Failed to refresh access token: {e}")
    
    def _get_headers(self) -> Dict[str, str]:
        """Get authorization headers for Gmail API requests."""
        if not self.access_token:
            raise RuntimeError("Not authenticated. Call authenticate() first.")
        return {"Authorization": f"Bearer {self.access_token}"}
    
    def get_label_id(self, label_name: str) -> str:
        """Find Gmail label ID by name."""
        try:
            response = requests.get(Config.GMAIL_LABELS_URL, headers=self._get_headers())
            response.raise_for_status()
            
            labels = response.json().get("labels", [])
            for label in labels:
                if label['name'] == label_name:
                    return label['id']
            
            raise ValueError(f"Label '{label_name}' not found")
        except requests.RequestException as e:
            raise RuntimeError(f"Failed to get label ID: {e}")
    
    def get_messages_by_label(self, label_id: str) -> List[Dict]:
        """Retrieve all messages with the specified label, handling pagination."""
        messages = []
        params = {"labelIds": label_id, "maxResults": 100}
        
        while True:
            try:
                response = requests.get(
                    Config.GMAIL_MESSAGES_URL, 
                    headers=self._get_headers(), 
                    params=params
                )
                response.raise_for_status()
                data = response.json()
                
                messages.extend(data.get("messages", []))
                
                next_page_token = data.get("nextPageToken")
                if not next_page_token:
                    break
                    
                params["pageToken"] = next_page_token
                
            except requests.RequestException as e:
                raise RuntimeError(f"Failed to retrieve messages: {e}")
        
        return messages
    
    def get_message_details(self, message_id: str) -> Dict:
        """Get full message details from Gmail API."""
        try:
            url = f"{Config.GMAIL_MESSAGES_URL}/{message_id}"
            response = requests.get(url, headers=self._get_headers())
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            raise RuntimeError(f"Failed to get message details: {e}")


class PiazzaMessageParser:
    """Handles parsing of Piazza-related information from Gmail messages."""
    
    @staticmethod
    def extract_message_body(payload: Dict) -> Optional[str]:
        """Extract plain text body from Gmail message payload."""
        # Check if body is directly available
        if 'body' in payload and 'data' in payload['body']:
            return PiazzaMessageParser._decode_base64_content(payload['body']['data'])
        
        # Check message parts for plain text
        if 'parts' in payload:
            for part in payload['parts']:
                if part['mimeType'] == 'text/plain' and 'body' in part and 'data' in part['body']:
                    return PiazzaMessageParser._decode_base64_content(part['body']['data'])
        
        return None
    
    @staticmethod
    def _decode_base64_content(data: str) -> str:
        """Decode base64-encoded message content."""
        try:
            decoded_bytes = base64.urlsafe_b64decode(data.encode('UTF-8'))
            return decoded_bytes.decode('UTF-8')
        except Exception as e:
            raise ValueError(f"Failed to decode message content: {e}")
    
    @staticmethod
    def extract_piazza_ids(payload: Dict) -> Tuple[Optional[str], Optional[str]]:
        """Extract Piazza post and course IDs from message payload."""
        body = PiazzaMessageParser.extract_message_body(payload)
        if not body:
            return None, None
        
        # Extract the Piazza view link
        match = re.search(r'Click here<([^>]+)> to view', body)
        if not match:
            return None, None
        
        view_link = match.group(1)
        parsed_url = urlparse(view_link)
        query_params = parse_qs(parsed_url.query)
        
        post_id = query_params.get('cid', [None])[0]
        course_id = query_params.get('nid', [None])[0]
        
        return post_id, course_id


class PiazzaGmailProcessor:
    """Main processor for handling Piazza notifications from Gmail."""
    
    def __init__(self):
        self.aws_service = AWSService()
        self.gmail_service = GmailService(self.aws_service)
        self.parser = PiazzaMessageParser()
    
    def process_messages(self) -> Dict[str, any]:
        """Process all new Piazza messages from Gmail."""
        # Authenticate and get label
        self.gmail_service.authenticate()
        label_id = self.gmail_service.get_label_id(Config.LABEL_NAME)
        
        # Get all messages with the label
        messages = self.gmail_service.get_messages_by_label(label_id)
        print(f"Found {len(messages)} messages under label '{Config.LABEL_NAME}'")
        
        # Filter out already processed messages and deduplicate by thread
        new_messages = self._filter_new_messages(messages)
        print(f"Processing {len(new_messages)} new messages")
        
        # Process each new message
        processed_count = 0
        for message in new_messages:
            try:
                self._process_single_message(message)
                processed_count += 1
            except Exception as e:
                print(f"Error processing message {message['id']}: {e}")
        
        return {
            'statusCode': 200,
            'body': json.dumps(f"Processed {processed_count} new messages under label '{Config.LABEL_NAME}'")
        }
    
    def _filter_new_messages(self, messages: List[Dict]) -> List[Dict]:
        """Filter out already processed messages and deduplicate by thread."""
        processed_threads = set()
        new_messages = []
        
        for message in messages:
            message_id = message['id']
            thread_id = message['threadId']
            
            # Skip if message already processed
            if self.aws_service.is_message_processed(message_id):
                continue
            
            # Skip if we've already seen this thread
            if thread_id in processed_threads:
                continue
            
            processed_threads.add(thread_id)
            new_messages.append(message)
        
        return new_messages
    
    def _process_single_message(self, message: Dict) -> None:
        """Process a single Gmail message and send to SQS if it contains Piazza data."""
        message_id = message['id']
        
        # Get full message details
        full_message = self.gmail_service.get_message_details(message_id)
        
        # Extract Piazza IDs
        post_id, course_id = self.parser.extract_piazza_ids(full_message['payload'])
        
        if not post_id or not course_id:
            print(f"Could not extract Piazza IDs from message {message_id}")
            return
        
        # Send to SQS
        self.aws_service.send_to_queue(post_id, course_id)
        print(f"Queued Piazza post {post_id} for course {course_id} from Gmail message {message_id}")


def lambda_handler(event, context):
    """AWS Lambda entry point."""
    try:
        processor = PiazzaGmailProcessor()
        return processor.process_messages()
    except Exception as e:
        print(f"Error in lambda_handler: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps(f"Error processing messages: {str(e)}")
        }


if __name__ == "__main__":
    lambda_handler({}, None)