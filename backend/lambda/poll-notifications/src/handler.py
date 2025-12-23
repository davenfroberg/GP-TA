from dataclasses import dataclass

import boto3
from boto3.dynamodb.conditions import Key
from pinecone import Pinecone
from utils.constants import (
    AWS_REGION_NAME,
    NOTIFICATIONS_DYNAMO_TABLE_NAME,
    PINECONE_INDEX_NAME,
    SECRETS,
    SENT_NOTIFICATIONS_DYNAMO_TABLE_NAME,
    SES_RECIPIENT_EMAIL,
    SES_SOURCE_EMAIL,
    USERS_TABLE_NAME,
)
from utils.logger import logger
from utils.utils import get_secret_api_key

# Initialize AWS clients
ssm_client = boto3.client("ssm")
ses = boto3.client("ses", region_name=AWS_REGION_NAME)
dynamo = boto3.resource("dynamodb")

# Initialize Pinecone
try:
    pc = Pinecone(api_key=get_secret_api_key(ssm_client, SECRETS["PINECONE"]))
    index = pc.Index(PINECONE_INDEX_NAME)
except Exception:
    logger.exception(
        "Failed to initialize Pinecone client", extra={"index_name": PINECONE_INDEX_NAME}
    )
    raise

# Initialize DynamoDB tables


@dataclass
class NotificationConfig:
    """Configuration for a notification query"""

    user_id: str
    query: str
    course_id: str
    course_name: str
    threshold: float
    top_k: int
    recipient_email: str


@dataclass
class EmbeddingMatch:
    """Represents a matching embedding from Pinecone"""

    chunk_id: str
    score: float
    root_id: str
    title: str
    post_num: int


class NotificationService:
    """Handles notification processing logic"""

    def __init__(self):
        self.notifications_sent = 0
        self.users_table = dynamo.Table(USERS_TABLE_NAME)
        self.sent_notifications_table = dynamo.Table(SENT_NOTIFICATIONS_DYNAMO_TABLE_NAME)
        self.notifications_table = dynamo.Table(NOTIFICATIONS_DYNAMO_TABLE_NAME)

        self.user_records = {}  # user_id -> user_record

    def get_user_record(self, user_id: str) -> dict:
        """Get user record from DynamoDB"""
        if user_id not in self.user_records:
            response = self.users_table.get_item(Key={"user_id": user_id})
            self.user_records[user_id] = response.get("Item", {})
        return self.user_records[user_id]

    def get_active_notifications(self) -> list[dict]:
        """Fetch all active notifications from DynamoDB with pagination"""
        logger.info("Fetching active notifications from DynamoDB")

        notifications = []
        response = self.notifications_table.scan()

        while True:
            notifications.extend(response.get("Items", []))

            if "LastEvaluatedKey" not in response:
                break
            response = self.notifications_table.scan(ExclusiveStartKey=response["LastEvaluatedKey"])

        logger.info("Found active notifications", extra={"notification_count": len(notifications)})
        return notifications

    def search_embeddings(self, query: str, course_id: str, top_k: int) -> list[EmbeddingMatch]:
        """Search Pinecone for matching embeddings"""
        logger.info(
            "Searching Pinecone for embeddings",
            extra={"query": query, "class_id": course_id, "top_k": top_k},
        )

        try:
            results = index.search(
                namespace="piazza",
                query={
                    "top_k": top_k,
                    "filter": {"class_id": course_id},
                    "inputs": {"text": query},
                },
            )

            hits = results["result"]["hits"]
            logger.info(
                "Pinecone search completed",
                extra={"class_id": course_id, "result_count": len(hits), "top_k": top_k},
            )

            return [self._parse_embedding(hit) for hit in hits]
        except Exception:
            logger.exception(
                "Failed to search Pinecone",
                extra={"query": query, "class_id": course_id, "top_k": top_k},
            )
            raise

    def _parse_embedding(self, hit: dict) -> EmbeddingMatch:
        """Parse Pinecone hit into EmbeddingMatch object"""
        fields = hit.get("fields", hit)
        return EmbeddingMatch(
            chunk_id=hit["_id"],
            score=hit["_score"],
            root_id=fields.get("root_id"),
            title=fields.get("title"),
            post_num=fields.get("root_post_num"),
        )

    def send_email_notification(self, config: NotificationConfig, match: EmbeddingMatch) -> bool:
        """Send email notification via SES"""
        subject = f"GP-TA found a relevant post for {config.course_name}"

        text_body = self._build_text_body(config, match)
        html_body = self._build_html_body(config, match)

        try:
            ses.send_email(
                Source=f"{config.course_name} on {SES_SOURCE_EMAIL}",
                Destination={"ToAddresses": [config.recipient_email]},
                Message={
                    "Subject": {"Data": subject, "Charset": "UTF-8"},
                    "Body": {
                        "Text": {"Data": text_body, "Charset": "UTF-8"},
                        "Html": {"Data": html_body, "Charset": "UTF-8"},
                    },
                },
            )
            logger.info(
                "Email sent successfully",
                extra={
                    "chunk_id": match.chunk_id,
                    "course_id": config.course_id,
                    "recipient_email": config.recipient_email,
                    "root_id": match.root_id,
                },
            )
            return True

        except Exception:
            logger.exception(
                "Failed to send email",
                extra={
                    "chunk_id": match.chunk_id,
                    "course_id": config.course_id,
                    "recipient_email": config.recipient_email,
                    "root_id": match.root_id,
                },
            )
            return False

    def _build_text_body(self, config: NotificationConfig, match: EmbeddingMatch) -> str:
        """Build plain text email body"""
        post_url = f"https://piazza.com/class/{config.course_id}/post/{match.root_id}"

        return (
            f"Hello,\n\n"
            f"A new Piazza update has been created that is relevant to your question "
            f'"{config.query}" in {config.course_name}.\n\n'
            f'GP-TA has identified the post for you, titled: "{match.title}".\n'
            f"You can view it here: {post_url}\n\n"
            f"Happy learning!\n"
            f"- The GP-TA Team"
        )

    def _build_html_body(self, config: NotificationConfig, match: EmbeddingMatch) -> str:
        """Build HTML email body"""
        post_url = f"https://piazza.com/class/{config.course_id}/post/{match.root_id}"

        return f"""
        <html>
        <head>
            <style>
                body {{
                    font-family: Arial, sans-serif;
                    line-height: 1.6;
                    color: #333333;
                }}
                a {{
                    color: #1a73e8;
                    text-decoration: none;
                }}
                a:hover {{
                    text-decoration: underline;
                }}
            </style>
        </head>
        <body>
            <p>A new Piazza update has been created that is relevant to your question
            <strong>"{config.query}"</strong> in <strong>{config.course_name}</strong>.</p>
            <p>GP-TA has identified the post for you, titled: <strong>"{match.title}"</strong>.</p>
            <p><a href="{post_url}">Click here to view the post</a></p>
            <p>Happy learning!<br>- The GP-TA Team</p>
        </body>
        </html>
        """

    def save_sent_notifications(
        self, user_id: str, course_id: str, query: str, chunk_ids: list[str]
    ) -> bool:
        """Save sent notifications with PK=user_id#course_id#query and SK=chunk_id"""
        if not chunk_ids:
            return True

        logger.info(
            "Writing notifications to sent_notifications_table",
            extra={
                "user_id": user_id,
                "course_id": course_id,
                "query": query,
                "chunk_count": len(chunk_ids),
            },
        )

        try:
            pk = f"{user_id}#{course_id}#{query}"

            with self.sent_notifications_table.batch_writer() as batch:
                for chunk_id in chunk_ids:
                    batch.put_item(
                        Item={
                            "user_id#course_id#query": pk,  # PK
                            "chunk_id": chunk_id,  # SK
                            "course_id": course_id,
                            "query": query,
                        }
                    )

            logger.info(
                "Successfully wrote notifications",
                extra={
                    "user_id": user_id,
                    "course_id": course_id,
                    "query": query,
                    "chunk_count": len(chunk_ids),
                },
            )
            return True

        except Exception:
            logger.exception(
                "Failed to write notifications",
                extra={
                    "user_id": user_id,
                    "course_id": course_id,
                    "query": query,
                    "chunk_count": len(chunk_ids),
                },
            )
            return False

    def update_notification_limit(
        self, user_id: str, course_id: str, query: str, increment: int
    ) -> bool:
        """Update max_notifications counter in notifications table"""
        try:
            sort_key = f"{course_id}#{query}"
            self.notifications_table.update_item(
                Key={"user_id": user_id, "course_id#query": sort_key},
                UpdateExpression="SET max_notifications = max_notifications + :inc",
                ExpressionAttributeValues={":inc": increment},
            )
            logger.info(
                "Updated max_notifications counter",
                extra={
                    "user_id": user_id,
                    "course_id": course_id,
                    "query": query,
                    "increment": increment,
                },
            )
            return True

        except Exception:
            logger.exception(
                "Failed to update max_notifications",
                extra={
                    "user_id": user_id,
                    "course_id": course_id,
                    "query": query,
                    "increment": increment,
                },
            )
            return False

    def get_sent_chunk_ids(self, user_id: str, course_id: str, query: str) -> set[str]:
        """Query sent_notifications_table to get all chunk_ids for this user_id#course_id#query"""
        pk = f"{user_id}#{course_id}#{query}"

        try:
            chunk_ids = set()
            response = self.sent_notifications_table.query(
                KeyConditionExpression=Key("user_id#course_id#query").eq(pk)
            )

            while True:
                chunk_ids.update(item["chunk_id"] for item in response.get("Items", []))

                if "LastEvaluatedKey" not in response:
                    break
                response = self.sent_notifications_table.query(
                    KeyConditionExpression=Key("user_id#course_id#query").eq(pk),
                    ExclusiveStartKey=response["LastEvaluatedKey"],
                )

            logger.info(
                "Found previously sent notifications",
                extra={
                    "user_id": user_id,
                    "course_id": course_id,
                    "query": query,
                    "sent_count": len(chunk_ids),
                },
            )
            return chunk_ids

        except Exception:
            logger.exception(
                "Failed to query sent notifications",
                extra={"user_id": user_id, "course_id": course_id, "query": query},
            )
            return set()

    def process_notification(self, notification_data: dict) -> int:
        """Process a single notification configuration"""
        user_record = self.get_user_record(notification_data["user_id"])
        recipient_email = user_record.get("email", SES_RECIPIENT_EMAIL)

        config = NotificationConfig(
            user_id=notification_data["user_id"],
            query=notification_data["query"],
            course_id=notification_data["course_id"],
            course_name=notification_data["course_display_name"],
            threshold=notification_data["notification_threshold"],
            top_k=int(notification_data["max_notifications"]),
            recipient_email=recipient_email,
        )

        logger.info(
            "Processing notification",
            extra={
                "user_id": config.user_id,
                "course_id": config.course_id,
                "course_name": config.course_name,
                "query": config.query,
                "threshold": config.threshold,
                "top_k": config.top_k,
            },
        )

        try:
            # Get all previously sent chunk_ids for this user_id#course_id#query
            sent_chunk_ids_set = self.get_sent_chunk_ids(
                config.user_id, config.course_id, config.query
            )

            # Search for matching embeddings
            embeddings = self.search_embeddings(config.query, config.course_id, config.top_k)

            new_sent_chunk_ids = []

            for match in embeddings:
                if not self._should_send_notification(match, sent_chunk_ids_set, config.threshold):
                    continue

                if self.send_email_notification(config, match):
                    new_sent_chunk_ids.append(match.chunk_id)

            if new_sent_chunk_ids:
                self.save_sent_notifications(
                    config.user_id, config.course_id, config.query, new_sent_chunk_ids
                )
                self.update_notification_limit(
                    config.user_id, config.course_id, config.query, len(new_sent_chunk_ids)
                )
                logger.info(
                    "Notification processing completed",
                    extra={
                        "user_id": config.user_id,
                        "course_id": config.course_id,
                        "query": config.query,
                        "notifications_sent": len(new_sent_chunk_ids),
                    },
                )
                return len(new_sent_chunk_ids)

            logger.info(
                "No new notifications to send",
                extra={
                    "user_id": config.user_id,
                    "course_id": config.course_id,
                    "query": config.query,
                },
            )
            return 0

        except Exception:
            logger.exception(
                "Error processing notification",
                extra={
                    "user_id": config.user_id,
                    "course_id": config.course_id,
                    "query": config.query,
                },
            )
            return 0

    def _should_send_notification(
        self, match: EmbeddingMatch, sent_chunk_ids: set[str], threshold: float
    ) -> bool:
        """Determine if notification should be sent for this match"""

        if match.score < threshold:
            logger.debug(
                "Skipping notification - score below threshold",
                extra={
                    "chunk_id": match.chunk_id,
                    "score": match.score,
                    "threshold": threshold,
                    "root_id": match.root_id,
                },
            )
            return False

        if match.chunk_id in sent_chunk_ids:
            logger.debug(
                "Skipping notification - already sent",
                extra={"chunk_id": match.chunk_id, "root_id": match.root_id},
            )
            return False

        logger.info(
            "Notification will be sent",
            extra={
                "chunk_id": match.chunk_id,
                "score": match.score,
                "threshold": threshold,
                "root_id": match.root_id,
                "title": match.title,
            },
        )
        return True


@logger.inject_lambda_context(log_event=True)
def lambda_handler(event: dict, context: dict) -> dict:
    """Main Lambda handler"""
    try:
        service = NotificationService()
        active_notifications = service.get_active_notifications()

        if not active_notifications:
            logger.info("No active notifications found")
            return {"statusCode": 200, "notifications_sent": 0}

        total_sent = 0
        for notification in active_notifications:
            total_sent += service.process_notification(notification)

        logger.info(
            "Lambda execution completed",
            extra={
                "total_notifications_sent": total_sent,
                "active_notification_count": len(active_notifications),
            },
        )
        return {"statusCode": 200, "notifications_sent": total_sent}

    except Exception as e:
        logger.exception("Fatal error in lambda_handler")
        return {"statusCode": 500, "error": str(e)}
