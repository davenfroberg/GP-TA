import json
from pprint import pprint
import boto3
import requests
import base64
from urllib.parse import urlparse, parse_qs
import re
from botocore.exceptions import ClientError

SECRET_NAME = "gmail_oauth"
REGION_NAME = "us-west-2"
LABEL_NAME = "piazza-project"
SQS_QUEUE_URL = "https://sqs.us-west-2.amazonaws.com/112745307245/PiazzaUpdateQueue"
GMAIL_TABLE_NAME = "gmail-messages"
dynamodb = boto3.client('dynamodb')
sqs = boto3.client('sqs')

def get_secret(secret_name=SECRET_NAME, region_name=REGION_NAME):
    """Fetch the secret from AWS Secrets Manager."""
    session = boto3.session.Session()
    client = session.client(service_name="secretsmanager", region_name=region_name)
    response = client.get_secret_value(SecretId=secret_name)
    secret = json.loads(response['SecretString'])
    return secret

def refresh_access_token(client_id, client_secret, refresh_token):
    """Use the refresh token to obtain a fresh access token."""
    token_url = "https://oauth2.googleapis.com/token"
    payload = {
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token"
    }
    response = requests.post(token_url, data=payload)
    response.raise_for_status()
    token_info = response.json()
    return token_info['access_token']

def get_label_id(access_token, label_name):
    """Find the Gmail label ID given its name."""
    headers = {"Authorization": f"Bearer {access_token}"}
    resp = requests.get("https://gmail.googleapis.com/gmail/v1/users/me/labels", headers=headers)
    resp.raise_for_status()
    labels = resp.json().get("labels", [])
    for label in labels:
        if label['name'] == label_name:
            return label['id']
    raise ValueError(f"Label '{label_name}' not found")

def list_messages(access_token, label_id):
    """List all messages under a specific label, handling pagination."""
    headers = {"Authorization": f"Bearer {access_token}"}
    params = {"labelIds": label_id, "maxResults": 100}
    all_messages = []
    next_page_token = None

    while True:
        if next_page_token:
            params["pageToken"] = next_page_token
        resp = requests.get("https://gmail.googleapis.com/gmail/v1/users/me/messages", headers=headers, params=params)
        resp.raise_for_status()
        data = resp.json()
        messages = data.get("messages", [])
        all_messages.extend(messages)
        next_page_token = data.get("nextPageToken")
        if not next_page_token:
            break

    return all_messages

def get_message_body(payload):
        if 'body' in payload and 'data' in payload['body']:
            data = payload['body']['data']
            decoded_bytes = base64.urlsafe_b64decode(data.encode('UTF-8'))
            return decoded_bytes.decode('UTF-8')
        elif 'parts' in payload:
            for part in payload['parts']:
                if part['mimeType'] == 'text/plain':
                    data = part['body']['data']
                    decoded_bytes = base64.urlsafe_b64decode(data.encode('UTF-8'))
                    return decoded_bytes.decode('UTF-8')
        return None
    
def extract_piazza_view_link(body):
    match = re.search(r'Click here<([^>]+)> to view', body)
    if match:
        return match.group(1)
    return None

def get_ids_from_message_payload(payload):
    body = get_message_body(payload)
    view_link = extract_piazza_view_link(body)
    parsed = urlparse(view_link)
    qs = parse_qs(parsed.query)
    cid = qs.get('cid', [None])[0]
    nid = qs.get('nid', [None])[0]
    return (cid, nid)

def lambda_handler(event, context):
    secret = get_secret()
    client_id = secret["client_id"]
    client_secret = secret["client_secret"]
    refresh_token = secret["refresh_token"]

    access_token = refresh_access_token(client_id, client_secret, refresh_token)
    label_id = get_label_id(access_token, LABEL_NAME)
    messages = list_messages(access_token, label_id)

    print(f"Found {len(messages)} messages under label '{LABEL_NAME}'")
    
    gmail_threads = set()
    to_process = []
    
    for msg in messages:
        message_id = msg['id']
        try:
            
            dynamodb.put_item(
                TableName=GMAIL_TABLE_NAME,
                Item={"gmail_message_id": {"S": message_id}},
                ConditionExpression="attribute_not_exists(gmail_message_id)"
            )
            thread_id = msg['threadId']
            # even though we've not processed this message, we may have processed another message in the same thread, so skip it
            if thread_id in gmail_threads:
                continue
            gmail_threads.add(thread_id)
            to_process.append(msg)

        except ClientError as e:
            if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
                # Item already exists, skip
                continue
            else:
                # Something else went wrong
                raise
    
    for msg in to_process:
        message_id = msg['id']
        # get the body of the messsage from gmail API and parse the class id and piazza message id from it
        headers = {"Authorization": f"Bearer {access_token}"}
        resp = requests.get(f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{message_id}", headers=headers)
        resp.raise_for_status()
        message = resp.json()
        payload = message['payload']
        post_id, course_id = get_ids_from_message_payload(payload)

        sqs_payload = {"post_id": post_id, "course_id": course_id}

        # Send the payload to the SQS queue
        sqs.send_message(
            QueueUrl=SQS_QUEUE_URL,
            MessageBody=json.dumps(sqs_payload)
        )

        print(f"Queued Piazza post {post_id} for course {course_id} from Gmail message {message_id}")
    
    return {
        'statusCode': 200,
        'body': json.dumps(f"Processed {len(to_process)} new messages under label '{LABEL_NAME}'")
    }

if __name__ == "__main__":
    lambda_handler({}, None)