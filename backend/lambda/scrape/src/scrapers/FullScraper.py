from scrapers.AbstractScraper import AbstractScraper
from scrapers.core.PiazzaDataExtractor import PiazzaDataExtractor
from scrapers.core.TextProcessor import TextProcessor

class FullScraper(AbstractScraper):
    def __init__(self):
        super().__init__()

    def scrape(self):
        """Main scrape function"""
        try:
            classes = self.piazza.get_user_classes()

            # Process each class
            for class_info in classes:
                class_id = class_info['nid']
                network = self.piazza.network(class_id)
                # each class gets its own data extractor
                extractor = PiazzaDataExtractor(network)
                
                # Process each post in the class
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
            
            return {
                "statusCode": 200,
                "message": f"Successfully upserted {total_chunks} chunks"
            }
            
        except Exception as e:
            print(f"Error in lambda_handler: {e}")
            raise