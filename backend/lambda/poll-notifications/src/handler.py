from pinecone import Pinecone
import boto3
import logging
from utils.constants import NOTIFICATIONS_DYNAMO_TABLE_NAME, SENT_NOTIFICATIONS_DYNAMO_TABLE_NAME, PINECONE_INDEX_NAME, SECRETS, AWS_REGION_NAME, SNS_TOPIC_ARN
from utils.utils import get_secret_api_key
from typing import List, Dict
from boto3.dynamodb.conditions import Key

logger = logging.getLogger()
logger.setLevel(logging.INFO)

secrets_client = boto3.client("secretsmanager", region_name=AWS_REGION_NAME)
pc = Pinecone(api_key=get_secret_api_key(secrets_client, SECRETS["PINECONE"]))
index = pc.Index(PINECONE_INDEX_NAME)
sns = boto3.client('sns', region_name=AWS_REGION_NAME)
dynamo = boto3.resource('dynamodb')
sent_notifications_table = dynamo.Table(SENT_NOTIFICATIONS_DYNAMO_TABLE_NAME)
notifications_table = dynamo.Table(NOTIFICATIONS_DYNAMO_TABLE_NAME)

def get_notifications_from_dynamo():
    logger.info("Fetching active notifications from DynamoDB")
    response = notifications_table.scan()
    notifications = []
    # handle pagination
    while True:
        for entry in response.get('Items', []):
            notifications.append(entry)
        # check for more pages
        if 'LastEvaluatedKey' not in response:
            break

        response = notifications_table.scan(ExclusiveStartKey=response['LastEvaluatedKey'])
    
    logger.info(f"Found {len(notifications)} active notifications")
    return notifications

def get_notified_chunks(course_id, query):
    logger.info(f"Fetching already notified chunks for course_id={course_id}, query={query}")
    chunk_ids = set()

    response = sent_notifications_table.query(
        KeyConditionExpression=Key('course_id').eq(course_id) & Key('query').eq(query),
        ProjectionExpression='chunk_id'
    )

    while True:
        for item in response.get('Items', []):
            if 'chunk_id' in item:
                chunk_ids.add(item['chunk_id'])

        if 'LastEvaluatedKey' not in response:
            break

        response = sent_notifications_table.query(
            KeyConditionExpression=Key('course_id').eq(course_id) & Key('query').eq(query),
            ProjectionExpression='chunk_id',
            ExclusiveStartKey=response['LastEvaluatedKey']
        )

    logger.info(f"Found {len(chunk_ids)} already notified chunks")
    return chunk_ids


def get_closest_embeddings(query: str, class_id, top_k) -> List[Dict]:
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
    return hits

def lambda_handler(event, context):
    try:
        active_notifications = get_notifications_from_dynamo()
        
        total_notifications_sent = 0
        
        for notification in active_notifications:
            query = notification['query']
            course_id = notification['course_id']
            course_name = notification['course_display_name']
            threshold = notification['notification_threshold']
            top_k = int(notification['max_notifications'])

            logger.info(f"Processing notification: course_id={course_id}, query='{query}', threshold={threshold}, top_k={top_k}")

            try:
                closest_embeddings = get_closest_embeddings(query, course_id, top_k)
                already_notified_chunks = get_notified_chunks(course_id, query)
                
                new_notifications_sent = []
                
                for embedding in closest_embeddings:
                    embedding_score = embedding['_score']
                    chunk_id = embedding['_id']
                    embedding_fields = embedding.get('fields', embedding)
                    root_id = embedding_fields.get('root_id')
                    title = embedding_fields.get('title')
                    
                    logger.info(f"Evaluating chunk_id={chunk_id}, score={embedding_score}, threshold={threshold}")
                    
                    if chunk_id in already_notified_chunks:
                        logger.info(f"Skipping chunk_id={chunk_id} - already notified")
                        continue

                    if embedding_score >= threshold:
                        logger.info(f"Sending notification for chunk_id={chunk_id}, score={embedding_score}")
                        
                        message = (
                            f"A new relevant Piazza post was just created for your question \"{query}\" for {course_name}\n\n"
                            f"GP-TA found this relevant post for you, titled \"{title}\". Check it out here: https://piazza.com/class/{course_id}/post/{root_id}"
                        )
                        
                        try:
                            sns.publish(
                                TopicArn=SNS_TOPIC_ARN,
                                Subject=f"GP-TA found a relevant post for {course_name}",
                                Message=message
                            )
                            logger.info(f"SNS notification sent successfully for chunk_id={chunk_id}")

                            new_notifications_sent.append({
                                "course_id": course_id,
                                "query": query,
                                "chunk_id": chunk_id
                            })
                        except Exception as e:
                            logger.error(f"Failed to send SNS notification for chunk_id={chunk_id}: {str(e)}")
                    else:
                        logger.info(f"Skipping chunk_id={chunk_id} - score {embedding_score} below threshold {threshold}")
                
                if len(new_notifications_sent) > 0:
                    logger.info(f"Writing {len(new_notifications_sent)} new notifications to sent_notifications_table")
                    
                    try:
                        # write new notifications sent to notifications-sent dynamo table
                        with sent_notifications_table.batch_writer() as batch:
                            for notification in new_notifications_sent:
                                batch.put_item(Item=notification)
                        
                        logger.info(f"Successfully wrote {len(new_notifications_sent)} notifications to sent_notifications_table")

                        # write to notifications dynamo table with top_k += notifications_sent
                        notifications_table.update_item(
                            Key={
                                'course_id': course_id,
                                'query': query
                            },
                            UpdateExpression="SET max_notifications = max_notifications + :inc",
                            ExpressionAttributeValues={
                                ':inc': len(new_notifications_sent)
                            }
                        )
                        
                        logger.info(f"Updated max_notifications for course_id={course_id}, query='{query}', incremented by {len(new_notifications_sent)}")
                        total_notifications_sent += len(new_notifications_sent)
                        
                    except Exception as e:
                        logger.error(f"Failed to write notifications to DynamoDB for course_id={course_id}, query='{query}': {str(e)}")
                else:
                    logger.info(f"No new notifications to send for course_id={course_id}, query='{query}'")
                    
            except Exception as e:
                logger.error(f"Error processing notification for course_id={course_id}, query='{query}': {str(e)}")
                continue
        
        logger.info(f"Lambda function completed. Total notifications sent: {total_notifications_sent}")
        return {"statusCode": 200, "notifications_sent": total_notifications_sent}
        
    except Exception as e:
        logger.error(f"Fatal error in lambda_handler: {str(e)}")
        return {"statusCode": 500, "error": str(e)}
    

if __name__ == "__main__":
    lambda_handler(None, None)