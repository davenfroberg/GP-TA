import os

PINECONE_INDEX_NAME = "piazza-chunks"
AWS_REGION_NAME = "us-west-2"
NOTIFICATIONS_DYNAMO_TABLE_NAME = "notifications"
SENT_NOTIFICATIONS_DYNAMO_TABLE_NAME = "notifications-sent"

SECRETS = {
    "PINECONE": "pinecone"
}

SES_SOURCE_EMAIL = "GP-TA <noreply@davenfroberg.com>"
SES_RECIPIENT_EMAIL = os.environ['SES_RECP_EMAIL']