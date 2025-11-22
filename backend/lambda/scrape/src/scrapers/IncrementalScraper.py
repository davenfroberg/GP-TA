from scrapers.AbstractScraper import AbstractScraper
from typing import List, Dict, Tuple
import json
from config.constants import AWS_REGION_NAME
import boto3
from scrapers.core.PiazzaDataExtractor import PiazzaDataExtractor
from scrapers.core.TextProcessor import TextProcessor

SQS_QUEUE_URL = "https://sqs.us-west-2.amazonaws.com/112745307245/PiazzaUpdateQueue"

class IncrementalScraper(AbstractScraper):
    def __init__(self):
        super().__init__()
        self.sqs = boto3.client("sqs", region_name=AWS_REGION_NAME)

    @staticmethod
    def group_messages_by_course(messages: List[Dict]) -> Tuple[Dict[str, List[str]], Dict[str, Dict]]:
        """Group messages by course_id and create post_id to message mapping."""
        grouped = {}
        postid_to_msg = {}
        
        for msg in messages:
            body = json.loads(msg['Body'])
            course_id = body['course_id']
            post_id = body['post_id']
            
            grouped.setdefault(course_id, []).append(post_id)
            postid_to_msg[post_id] = msg
        
        print(f"Grouped posts by course: {dict((k, len(v)) for k, v in grouped.items())}")
        return grouped, postid_to_msg

    def process_sqs_messages(self) -> List[Dict]:
        """Fetch all messages from the SQS queue."""
        all_messages = []
        
        while True:
            response = self.sqs.receive_message(
                QueueUrl=SQS_QUEUE_URL,
                MaxNumberOfMessages=10,
                WaitTimeSeconds=1
            )
            
            messages = response.get('Messages', [])
            if not messages:
                break
            
            all_messages.extend(messages)
        
        print(f"Fetched {len(all_messages)} messages from SQS queue.")
        return all_messages

    def scrape(self, event):
        """Main scrape function"""
        # get pending messages from SQS and group them by their course
        messages = self.process_sqs_messages()
        grouped, postid_to_msg = self.group_messages_by_course(messages)
        
        # Process each course at a time
        for course_id, post_ids in grouped.items():
            network = self.piazza.network(course_id)
            extractor = PiazzaDataExtractor(network)
            for post_id in post_ids:
                sqs_msg = postid_to_msg[post_id]
                try:
                    post_chunks = []
                    post = network.get_post(post_id)
                    blobs = extractor.extract_all_post_blobs(post)

                    for blob in blobs:
                        text_chunks = TextProcessor.generate_chunks(blob)
                        for idx, chunk_text in enumerate(text_chunks):
                            chunk = self.chunk_manager.create_chunk(blob, idx, chunk_text, course_id)
                            post_chunks.append(chunk)
                    
                    # this actually does the upsert to Pinecone and store to DynamoDB
                    self.chunk_manager.process_post_chunks(post_chunks)
                    
                    # handle the raw post logic (for summarization)
                    self.post_manager.process_post(post, course_id)
                    
                    # Delete SQS message after successful processing of the post
                    self.sqs.delete_message(QueueUrl=SQS_QUEUE_URL, ReceiptHandle=sqs_msg['ReceiptHandle'])
                    print(f"Deleted SQS message for post_id {post_id}")
                    
                except Exception as e:
                    print(f"Error processing post_id {post_id}: {e}")
    
        total_chunks = self.chunk_manager.finalize()

        return {
            "statusCode": 200,
            "message": f"Successfully upserted {total_chunks} chunks"
        }
