from scrapers.AbstractScraper import AbstractScraper
from scrapers.core.PiazzaDataExtractor import PiazzaDataExtractor
from scrapers.core.TextProcessor import TextProcessor

class FullScraper(AbstractScraper):
    def __init__(self):
        super().__init__()
    
    def scrape(self, event):
        try:
            course_id = event["course_id"]
        except Exception as e:
            print(f"Error getting course_id from scrape message: {e}")
            raise
        
        self.scrape_class(course_id)

    def scrape_class(self, class_id):
        """Main scrape function"""
        print(f"Starting scrape for course_id: {class_id}")
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
            
            total_chunks = self.chunk_manager.finalize()
            print(f"Successfully upserted {total_chunks} chunks for course_id: {class_id}")
            print(f"Ending scrape for course_id: {class_id}")
            
            return {
                "statusCode": 200,
                "message": f"Successfully upserted {total_chunks} chunks"
            }
            
        except Exception as e:
            print(f"Error when scraping course_id: {class_id}: {e}")
            raise