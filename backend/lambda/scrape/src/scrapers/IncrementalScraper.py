import json

import boto3
from aws_lambda_powertools.metrics import MetricUnit
from config.constants import AWS_REGION_NAME, IGNORED_COURSE_IDS
from config.logger import logger
from config.metrics import metrics
from scrapers.AbstractScraper import AbstractScraper
from scrapers.core.PiazzaDataExtractor import PiazzaDataExtractor
from scrapers.core.TextProcessor import TextProcessor

SQS_QUEUE_URL = "https://sqs.us-west-2.amazonaws.com/112745307245/PiazzaUpdateQueue"


class IncrementalScraper(AbstractScraper):
    def __init__(self):
        super().__init__()
        self.sqs = boto3.client("sqs", region_name=AWS_REGION_NAME)

    @staticmethod
    def group_messages_by_course(
        messages: list[dict],
    ) -> tuple[dict[str, list[str]], dict[str, dict]]:
        """Group messages by course_id and create post_id to message mapping."""
        grouped = {}
        postid_to_msg = {}

        for msg in messages:
            body = json.loads(msg["Body"])
            course_id = body["course_id"]
            post_id = body["post_id"]

            grouped.setdefault(course_id, []).append(post_id)
            postid_to_msg[post_id] = msg

        return grouped, postid_to_msg

    def process_sqs_messages(self) -> list[dict]:
        """Fetch all messages from the SQS queue."""
        all_messages = []

        while True:
            response = self.sqs.receive_message(
                QueueUrl=SQS_QUEUE_URL, MaxNumberOfMessages=10, WaitTimeSeconds=1
            )

            messages = response.get("Messages", [])
            if not messages:
                break

            all_messages.extend(messages)

        logger.info("Fetched SQS messages", extra={"message_count": len(all_messages)})
        return all_messages

    def scrape(self, event):
        """Main scrape function"""
        # get pending messages from SQS and group them by their course
        messages = self.process_sqs_messages()
        metrics.add_metric(name="ScrapeSqsMessages", unit=MetricUnit.Count, value=len(messages))
        grouped, postid_to_msg = self.group_messages_by_course(messages)

        # Process each course at a time
        processed_posts = 0
        failed_posts = 0
        for course_id, post_ids in grouped.items():
            # Skip ignored courses
            if course_id in IGNORED_COURSE_IDS:
                logger.info(
                    "Skipping ignored course",
                    extra={"course_id": course_id, "post_count": len(post_ids)},
                )
                # Delete SQS messages for ignored course without processing
                for post_id in post_ids:
                    sqs_msg = postid_to_msg[post_id]
                    try:
                        self.sqs.delete_message(
                            QueueUrl=SQS_QUEUE_URL, ReceiptHandle=sqs_msg["ReceiptHandle"]
                        )
                    except Exception:
                        logger.exception(
                            "Failed to delete SQS message for ignored course",
                            extra={"post_id": post_id, "course_id": course_id},
                        )
                continue

            logger.info(
                "Processing incremental updates for course",
                extra={"course_id": course_id, "post_count": len(post_ids)},
            )
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
                            chunk = self.chunk_manager.create_chunk(
                                blob, idx, chunk_text, course_id
                            )
                            post_chunks.append(chunk)

                    # this actually does the upsert to Pinecone and store to DynamoDB
                    self.chunk_manager.process_post_chunks(post_chunks)

                    # handle the raw post logic (for summarization)
                    self.post_manager.process_post(post, course_id)

                    # Delete SQS message after successful processing of the post
                    self.sqs.delete_message(
                        QueueUrl=SQS_QUEUE_URL, ReceiptHandle=sqs_msg["ReceiptHandle"]
                    )
                    logger.debug("Deleted SQS message", extra={"post_id": post_id})
                    processed_posts += 1

                except Exception:
                    failed_posts += 1
                    logger.exception(
                        "Failed processing post", extra={"post_id": post_id, "course_id": course_id}
                    )

        total_chunks = self.chunk_manager.finalize()
        logger.info(
            "Incremental scrape complete",
            extra={"chunks_upserted": total_chunks},
        )
        metrics.add_metric(
            name="ScrapePostsProcessed", unit=MetricUnit.Count, value=processed_posts
        )
        metrics.add_metric(name="ScrapePostFailures", unit=MetricUnit.Count, value=failed_posts)
        metrics.add_metric(name="ScrapeChunksUpserted", unit=MetricUnit.Count, value=total_chunks)

        return {"statusCode": 200, "message": f"Successfully upserted {total_chunks} chunks"}
