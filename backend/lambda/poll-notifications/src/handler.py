from pinecone import Pinecone
import boto3
import logging
from utils.constants import (
    NOTIFICATIONS_DYNAMO_TABLE_NAME, 
    SENT_NOTIFICATIONS_DYNAMO_TABLE_NAME, 
    PINECONE_INDEX_NAME, 
    SECRETS, 
    AWS_REGION_NAME,
    SES_SOURCE_EMAIL,
    SES_RECIPIENT_EMAIL
)
from utils.utils import get_secret_api_key
from typing import List, Dict, Set
from boto3.dynamodb.conditions import Key
from dataclasses import dataclass

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
ssm_client = boto3.client('ssm')
ses = boto3.client('ses', region_name=AWS_REGION_NAME)
dynamo = boto3.resource('dynamodb')

# Initialize Pinecone
pc = Pinecone(api_key=get_secret_api_key(ssm_client, SECRETS["PINECONE"]))
index = pc.Index(PINECONE_INDEX_NAME)

# Initialize DynamoDB tables
sent_notifications_table = dynamo.Table(SENT_NOTIFICATIONS_DYNAMO_TABLE_NAME)
notifications_table = dynamo.Table(NOTIFICATIONS_DYNAMO_TABLE_NAME)


@dataclass
class NotificationConfig:
    """Configuration for a notification query"""
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
    
    def get_active_notifications(self) -> List[Dict]:
        """Fetch all active notifications from DynamoDB with pagination"""
        logger.info("Fetching active notifications from DynamoDB")
        
        notifications = []
        response = notifications_table.scan()
        
        while True:
            notifications.extend(response.get('Items', []))
            
            if 'LastEvaluatedKey' not in response:
                break
            response = notifications_table.scan(
                ExclusiveStartKey=response['LastEvaluatedKey']
            )
        
        logger.info(f"Found {len(notifications)} active notifications")
        return notifications
    
    def search_embeddings(self, query: str, class_id: str, top_k: int) -> List[EmbeddingMatch]:
        """Search Pinecone for matching embeddings"""
        logger.info(f"Searching Pinecone for query='{query}', class_id={class_id}, top_k={top_k}")
        
        results = index.search(
            namespace="piazza",
            query={
                "top_k": top_k,
                "filter": {"class_id": class_id},
                "inputs": {"text": query}
            }
        )
        
        hits = results['result']['hits']
        logger.info(f"Pinecone returned {len(hits)} results")
        
        return [self._parse_embedding(hit) for hit in hits]
    
    def _parse_embedding(self, hit: Dict) -> EmbeddingMatch:
        """Parse Pinecone hit into EmbeddingMatch object"""
        fields = hit.get('fields', hit)
        return EmbeddingMatch(
            chunk_id=hit['_id'],
            score=hit['_score'],
            root_id=fields.get('root_id'),
            title=fields.get('title'),
            post_num=fields.get('root_post_num')
        )
    
    def send_email_notification(self, config: NotificationConfig, match: EmbeddingMatch) -> bool:
        """Send email notification via SES"""
        subject = f"GP-TA found a relevant post for {config.course_name}"
        
        text_body = self._build_text_body(config, match)
        html_body = self._build_html_body(config, match)
        
        try:
            ses.send_email(
                Source=f"{config.course_name} on {SES_SOURCE_EMAIL}",
                Destination={'ToAddresses': [config.recipient_email]},
                Message={
                    'Subject': {'Data': subject, 'Charset': 'UTF-8'},
                    'Body': {
                        'Text': {'Data': text_body, 'Charset': 'UTF-8'},
                        'Html': {'Data': html_body, 'Charset': 'UTF-8'}
                    }
                }
            )
            logger.info(f"Email sent successfully for chunk_id={match.chunk_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send email for chunk_id={match.chunk_id}: {str(e)}")
            return False
    
    def _build_text_body(self, config: NotificationConfig, match: EmbeddingMatch) -> str:
        """Build plain text email body"""
        post_url = f"https://piazza.com/class/{config.course_id}/post/{match.root_id}"
        
        return (
            f"Hello,\n\n"
            f"A new Piazza update has been created that is relevant to your question "
            f"\"{config.query}\" in {config.course_name}.\n\n"
            f"GP-TA has identified the post for you, titled: \"{match.title}\".\n"
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
    
    def save_sent_notifications(self, course_id: str, query: str, chunk_ids: List[str]) -> bool:
        """Save sent notifications with PK=course_id#query and SK=chunk_id"""
        if not chunk_ids:
            return True
        
        logger.info(f"Writing {len(chunk_ids)} notifications to sent_notifications_table")
        
        try:
            pk = f"{course_id}#{query}"
            
            with sent_notifications_table.batch_writer() as batch:
                for chunk_id in chunk_ids:
                    batch.put_item(Item={
                        "course_id#query": pk,     # PK
                        "chunk_id": chunk_id,      # SK
                        "course_id": course_id,
                        "query": query
                    })
            
            logger.info(f"Successfully wrote {len(chunk_ids)} notifications")
            return True
            
        except Exception as e:
            logger.error(f"Failed to write notifications: {str(e)}")
            return False
    
    def update_notification_limit(self, course_id: str, query: str, increment: int) -> bool:
        """Update max_notifications counter in notifications table"""
        try:
            notifications_table.update_item(
                Key={'course_id': course_id, 'query': query},
                UpdateExpression="SET max_notifications = max_notifications + :inc",
                ExpressionAttributeValues={':inc': increment}
            )
            logger.info(f"Updated max_notifications for course_id={course_id}, incremented by {increment}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to update max_notifications: {str(e)}")
            return False
    
    def get_sent_chunk_ids(self, course_id: str, query: str) -> Set[str]:
        """Query sent_notifications_table to get all chunk_ids for this course_id#query"""
        pk = f"{course_id}#{query}"
        
        try:
            chunk_ids = set()
            response = sent_notifications_table.query(
                KeyConditionExpression=Key("course_id#query").eq(pk)
            )
            
            while True:
                chunk_ids.update(item['chunk_id'] for item in response.get('Items', []))
                
                if 'LastEvaluatedKey' not in response:
                    break
                response = sent_notifications_table.query(
                    KeyConditionExpression=Key("course_id#query").eq(pk),
                    ExclusiveStartKey=response['LastEvaluatedKey']
                )
            
            logger.info(f"Found {len(chunk_ids)} previously sent notifications for course_id={course_id}, query='{query}'")
            return chunk_ids
            
        except Exception as e:
            logger.error(f"Failed to query sent notifications: {str(e)}")
            return set()
    
    def process_notification(self, notification_data: Dict) -> int:
        """Process a single notification configuration"""
        config = NotificationConfig(
            query=notification_data['query'],
            course_id=notification_data['course_id'],
            course_name=notification_data['course_display_name'],
            threshold=notification_data['notification_threshold'],
            top_k=int(notification_data['max_notifications']),
            recipient_email=notification_data.get('email', SES_RECIPIENT_EMAIL)
        )
        
        logger.info(f"Processing: course_id={config.course_id}, query='{config.query}'")
        
        try:
            # Get all previously sent chunk_ids for this course_id#query
            sent_chunk_ids_set = self.get_sent_chunk_ids(config.course_id, config.query)
            
            # Search for matching embeddings
            embeddings = self.search_embeddings(config.query, config.course_id, config.top_k)
            
            new_sent_chunk_ids = []
            
            for match in embeddings:
                if not self._should_send_notification(match, sent_chunk_ids_set, config.threshold):
                    continue
                
                if self.send_email_notification(config, match):
                    new_sent_chunk_ids.append(match.chunk_id)
            
            if new_sent_chunk_ids:
                self.save_sent_notifications(config.course_id, config.query, new_sent_chunk_ids)
                self.update_notification_limit(config.course_id, config.query, len(new_sent_chunk_ids))
                return len(new_sent_chunk_ids)
            
            logger.info(f"No new notifications for course_id={config.course_id}")
            return 0
            
        except Exception as e:
            logger.error(f"Error processing notification: {str(e)}")
            return 0
    
    def _should_send_notification(self, match: EmbeddingMatch, sent_chunk_ids: Set[str], threshold: float) -> bool:
        """Determine if notification should be sent for this match"""
        
        if match.score < threshold:
            logger.info(f"Skipping chunk_id={match.chunk_id} - score below threshold {threshold}")
            return False

        if match.chunk_id in sent_chunk_ids:
            logger.info(f"Skipping chunk_id={match.chunk_id} - already notified for this query")
            return False

        logger.info(f"Sending notification for chunk_id={match.chunk_id}")
        return True


def lambda_handler(event, context):
    """Main Lambda handler"""
    try:
        service = NotificationService()
        active_notifications = service.get_active_notifications()
        
        total_sent = 0
        for notification in active_notifications:
            total_sent += service.process_notification(notification)
        
        logger.info(f"Lambda completed. Total notifications sent: {total_sent}")
        return {"statusCode": 200, "notifications_sent": total_sent}
        
    except Exception as e:
        logger.error(f"Fatal error in lambda_handler: {str(e)}")
        return {"statusCode": 500, "error": str(e)}


if __name__ == "__main__":
    lambda_handler(None, None)