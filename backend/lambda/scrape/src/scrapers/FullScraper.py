from aws_lambda_powertools.metrics import MetricUnit
from config.constants import IGNORED_COURSE_IDS
from config.logger import logger
from config.metrics import metrics
from scrapers.AbstractScraper import AbstractScraper
from scrapers.core.PiazzaDataExtractor import PiazzaDataExtractor
from scrapers.core.TextProcessor import TextProcessor


class FullScraper(AbstractScraper):
    def __init__(self):
        super().__init__()

    def scrape(self, event):
        try:
            course_id = event["course_id"]
        except Exception:
            logger.exception("Failed to extract course_id from event")
            raise

        self.scrape_class(course_id)

    def scrape_class(self, class_id):
        """Main scrape function"""
        # Skip ignored courses
        if class_id in IGNORED_COURSE_IDS:
            logger.info("Skipping ignored course", extra={"course_id": class_id})
            return {"statusCode": 200, "message": f"Skipped ignored course {class_id}"}

        logger.info("Starting full scrape", extra={"course_id": class_id})
        metrics.add_metric(name="ScrapeRuns", unit=MetricUnit.Count, value=1)
        processed_posts = 0
        try:
            network = self.piazza.network(class_id)
            extractor = PiazzaDataExtractor(network)

            # Process each post in the given class
            for post in network.iter_all_posts(limit=None, sleep=1):
                post_chunks = []

                # Extract all blobs from the post
                blobs = extractor.extract_all_post_blobs(post)

                # Generate chunks for each blob
                for blob in blobs:
                    text_chunks = TextProcessor.generate_chunks(blob)
                    for idx, chunk_text in enumerate(text_chunks):
                        chunk = self.chunk_manager.create_chunk(blob, idx, chunk_text, class_id)
                        post_chunks.append(chunk)
                # this actually does the upsert to Pinecone and store to DynamoDB
                self.chunk_manager.process_post_chunks(post_chunks)
                processed_posts += 1

            total_chunks = self.chunk_manager.finalize()
            logger.info(
                "Completed full scrape",
                extra={"course_id": class_id, "total_chunks": total_chunks},
            )
            metrics.add_metric(
                name="ScrapePostsProcessed", unit=MetricUnit.Count, value=processed_posts
            )
            metrics.add_metric(
                name="ScrapeChunksUpserted", unit=MetricUnit.Count, value=total_chunks
            )

            return {"statusCode": 200, "message": f"Successfully upserted {total_chunks} chunks"}

        except Exception:
            logger.exception("Full scrape failed", extra={"course_id": class_id})
            raise
