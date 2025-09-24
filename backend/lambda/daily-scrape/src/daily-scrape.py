import re
import json
import hashlib
from pprint import pprint

import boto3
from botocore.exceptions import ClientError
from piazza_api import Piazza
from pinecone import Pinecone
from bs4 import BeautifulSoup


# Configuration Constants
class Config:
    SECRETS = {
        "PIAZZA": "piazza",
        "PINECONE": "pinecone"
    }
    AWS_REGION_NAME = "us-west-2"
    DYNAMO_TABLE_NAME = "piazza-chunks"
    PINECONE_INDEX_NAME = "piazza-chunks"
    PINECONE_NAMESPACE = "piazza"
    DYNAMO_BATCH_GET_SIZE = 100
    PINECONE_BATCH_SIZE = 25
    DEFAULT_CHUNK_SIZE = 100


# AWS and Database Setup
dynamodb = boto3.resource("dynamodb")
chunk_dynamo_table = dynamodb.Table(Config.DYNAMO_TABLE_NAME)


class AWSSecretsManager:
    """Handles AWS Secrets Manager operations"""
    
    @staticmethod
    def get_secret_api_key(secret_name, region_name=Config.AWS_REGION_NAME):
        """Get API key from AWS Secrets Manager"""
        session = boto3.session.Session()
        client = session.client(
            service_name='secretsmanager',
            region_name=region_name
        )
        try:
            response = client.get_secret_value(SecretId=secret_name)
            secret_dict = json.loads(response['SecretString'])
            return secret_dict['api_key']
        except ClientError as e:
            print(f"Error retrieving secret: {e}")
            raise
        except Exception as e:
            print(f"Unexpected error: {e}")
            raise

    @staticmethod
    def get_piazza_credentials(secret_name=Config.SECRETS['PIAZZA'], region_name=Config.AWS_REGION_NAME):
        """Get Piazza username and password from AWS Secrets Manager"""
        session = boto3.session.Session()
        client = session.client(
            service_name='secretsmanager',
            region_name=region_name
        )
        try:
            response = client.get_secret_value(SecretId=secret_name)
            secret_dict = json.loads(response['SecretString'])
            username = secret_dict['username']
            password = secret_dict['password']
            print("Successfully retrieved Piazza credentials from AWS secrets manager")
            return username, password
        except ClientError as e:
            print(f"Error retrieving secret: {e}")
            raise
        except Exception as e:
            print(f"Unexpected error: {e}")
            raise


class TextProcessor:
    """Handles text cleaning and chunking operations"""
    
    @staticmethod
    def clean_html_text(raw_html):
        """Clean HTML content and return plain text"""
        soup = BeautifulSoup(raw_html, "html.parser")
        text = soup.get_text(separator="\n")
        text = re.sub(r"&[#\w]+;", "", text)
        text = re.sub(r"\n\s*\n", "\n", text)
        return text.strip()

    @staticmethod
    def split_sentences(text):
        """Split text into sentences using punctuation"""
        sentences = re.split(r'(?<=[.!?])\s+', text)
        return [s.strip() for s in sentences if s.strip()]

    @staticmethod
    def generate_chunks(blob, chunk_size=Config.DEFAULT_CHUNK_SIZE):
        """Generate text chunks from a blob with sentence overlap"""
        text = blob['content']
        title = blob.get('title')
        
        sentences = TextProcessor.split_sentences(text)
        
        chunks = []
        current_chunk = []
        current_word_count = 0

        for sentence in sentences:
            sentence_word_count = len(sentence.split())
            
            # Check if adding this sentence would exceed chunk size
            if current_word_count + sentence_word_count > chunk_size and current_chunk:
                # Finalize current chunk
                chunk_text = " ".join(current_chunk)
                if title:
                    chunk_text = f"Title: {title}\n\n{chunk_text}"
                chunks.append(chunk_text)
                
                # Start new chunk with previous sentence as overlap
                current_chunk = [current_chunk[-1]] if len(current_chunk) >= 1 else []
                current_word_count = sum(len(s.split()) for s in current_chunk)

            current_chunk.append(sentence)
            current_word_count += sentence_word_count

        # Add any remaining sentences as the last chunk
        if current_chunk:
            chunk_text = " ".join(current_chunk)
            if title:
                chunk_text = f"Title: {title}\n\n{chunk_text}"
            chunks.append(chunk_text)

        return chunks

    @staticmethod
    def compute_hash(text):
        """Generate SHA256 hash of text content"""
        return hashlib.sha256(text.encode("utf-8")).hexdigest()


class PiazzaDataExtractor:
    """Handles Piazza data extraction and processing"""
    
    def __init__(self, network):
        self.network = network
        self.person_name_cache = {}
    
    def get_name_from_userid(self, userid):
        """Get user name from user ID with caching"""
        if userid == '':
            return "Anonymous"
        if userid in self.person_name_cache:
            return self.person_name_cache[userid]
        
        user = self.network.get_users([userid])[0]
        if user:
            self.person_name_cache[userid] = user.get('name', 'Unknown User')
            return self.person_name_cache[userid]
        return "Unknown User"

    @staticmethod
    def is_endorsed(post):
        """Check if a post is endorsed by an instructor"""
        endorsements = post.get('tag_endorse', [])
        for endorsement in endorsements:
            if endorsement.get('admin', False):
                return True
        return False
    
    def extract_children(self, children, root_id, root_title, parent_id, root_post_number):
        """Recursively extract child posts (answers, followups, etc.)"""
        blobs = []
        for child in children:
            history_item = child.get('history', [{}])[0]
            
            blob_info = {
                'content': TextProcessor.clean_html_text(
                    history_item.get('content', '') if 'content' in history_item else child.get('subject', '')
                ),
                'date': history_item.get('created', child.get('created', '')),
                'post_num': root_post_number, # children get the same post number as root
                'id': child.get('id', ''),
                'parent_id': parent_id,
                'type': child.get('type', ''),
                'is_endorsed': 'yes' if (child.get('type') == 's_answer' and self.is_endorsed(child)) else 'no' if child.get('type') == 's_answer' else 'n/a', # only student answers can be endorsed
                'root_id': root_id,
                'title': root_title,
                'person_id': history_item.get('uid', 'anonymous'),
                'person_name': self.get_name_from_userid(history_item.get('uid', ''))
            }
            
            blobs.append(blob_info)
            
            # Recursively process children
            blobs.extend(
                self.extract_children(
                    child.get('children', []), 
                    root_id, 
                    root_title, 
                    blob_info['id'], 
                    root_post_number
                )
            )
        return blobs

    def extract_all_post_blobs(self, post):
        """Extract all blobs (question + answers + followups) from a Piazza post"""
        blobs = []
        history_item = post.get('history', [{}])[0]
        root_title = history_item.get('subject', '')
        
        # Extract root question
        root_blob = {
            'content': TextProcessor.clean_html_text(history_item.get('content', '')),
            'title': root_title,
            'person_id': history_item.get('uid', 'anonymous'),
            'person_name': self.get_name_from_userid(history_item.get('uid', '')),
            'is_endorsed': 'n/a',  # only student answers can be endorsed
            'date': history_item.get('created', ''),
            'post_num': post.get('nr', 0),
            'id': post.get('id', ''),
            'parent_id': post.get('id', ''),
            'root_id': post.get('id', ''),
            'type': post.get('type', '')
        }
        
        blobs.append(root_blob)
        
        # Extract children (answers, followups, etc.)
        blobs.extend(
            self.extract_children(
                post.get('children', []), 
                root_blob['id'], 
                root_title, 
                root_blob['id'], 
                root_blob['post_num']
            )
        )
        
        return blobs


class ChunkManager:
    """Manages chunk creation, deduplication, and storage"""
    
    def __init__(self, pinecone_index):
        self.pinecone_index = pinecone_index
        self.pinecone_batch = []
        self.chunk_count = 0
    
    def create_chunk(self, blob, chunk_index, chunk_text, class_id):
        """Create a chunk dictionary from blob data"""
        content_hash = TextProcessor.compute_hash(chunk_text)
        
        return {
            "id": f"{blob['id']}#{chunk_index}",
            "class_id": class_id,
            "blob_id": blob['id'],
            "chunk_index": chunk_index,
            "root_id": blob['root_id'],
            "parent_id": blob['parent_id'],
            "root_post_num": blob['post_num'],
            "is_endorsed": blob['is_endorsed'],
            "person_id": blob['person_id'],
            "person_name": blob['person_name'],
            "type": blob['type'],
            "title": blob['title'],
            "date": blob['date'],
            "content_hash": content_hash,
            "chunk_text": chunk_text,
        }
    
    def process_post_chunks(self, post_chunks):
        """Process chunks for a single post with deduplication"""
        for i in range(0, len(post_chunks), Config.DYNAMO_BATCH_GET_SIZE):
            batch = post_chunks[i:i + Config.DYNAMO_BATCH_GET_SIZE]
            
            # Check for existing chunks in DynamoDB
            existing_chunks = self._get_existing_chunks(batch)
            
            # Filter out duplicates and process new/updated chunks
            chunks_to_insert = self._filter_new_chunks(batch, existing_chunks)
            
            if chunks_to_insert:
                self._store_chunks(chunks_to_insert)
    
    def _get_existing_chunks(self, batch):
        """Get existing chunks from DynamoDB"""
        keys_to_check = [
            {"parent_id": chunk['parent_id'], "id": chunk['id']}
            for chunk in batch
        ]

        response = dynamodb.batch_get_item(
            RequestItems={Config.DYNAMO_TABLE_NAME: {"Keys": keys_to_check}}
        )

        return {
            item['id']: item
            for item in response['Responses'].get(Config.DYNAMO_TABLE_NAME, [])
        }
    
    def _filter_new_chunks(self, batch, existing_chunks):
        """Filter out chunks that haven't changed"""
        chunks_to_insert = []
        
        for chunk in batch:
            existing = existing_chunks.get(chunk['id'])
            if existing and existing.get('content_hash') == chunk['content_hash']:
                print(f"Skipped duplicate chunk {chunk['id']}")
                continue
            
            chunks_to_insert.append(chunk)
            self.pinecone_batch.append(chunk)
            self.chunk_count += 1
            
            # Flush Pinecone batch if needed
            if len(self.pinecone_batch) >= Config.PINECONE_BATCH_SIZE:
                self._flush_pinecone_batch()
        
        return chunks_to_insert
    
    def _store_chunks(self, chunks_to_insert):
        """Store chunks in DynamoDB"""
        with chunk_dynamo_table.batch_writer() as batch_writer:
            for chunk in chunks_to_insert:
                batch_writer.put_item(Item=chunk)
                print(f"Inserted/Updated chunk {chunk['id']}")
        
        # Flush Pinecone batch after DynamoDB write
        if self.pinecone_batch:
            self._flush_pinecone_batch()
    
    def _flush_pinecone_batch(self):
        """Flush current batch to Pinecone"""
        if self.pinecone_batch:
            self.pinecone_index.upsert_records(Config.PINECONE_NAMESPACE, self.pinecone_batch)
            print(f"Upserted {len(self.pinecone_batch)} chunks to Pinecone")
            self.pinecone_batch = []
    
    def finalize(self):
        """Flush any remaining chunks and return count"""
        self._flush_pinecone_batch()
        return self.chunk_count


def lambda_handler(event, context):
    """Main Lambda handler function"""
    try:
        # Initialize services
        username, password = AWSSecretsManager.get_piazza_credentials()
        pinecone_api_key = AWSSecretsManager.get_secret_api_key(Config.SECRETS['PINECONE'])
        
        # Setup Piazza API
        piazza = Piazza()
        piazza.user_login(email=username, password=password)
        classes = piazza.get_user_classes()
        
        # Setup Pinecone
        pinecone_client = Pinecone(api_key=pinecone_api_key)
        pinecone_index = pinecone_client.Index(Config.PINECONE_INDEX_NAME)
        
        # Initialize chunk manager
        chunk_manager = ChunkManager(pinecone_index)
        
        # Process each class
        for class_info in classes:
            class_id = class_info['nid']
            network = piazza.network(class_id)
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
                        chunk = chunk_manager.create_chunk(blob, idx, chunk_text, class_id)
                        post_chunks.append(chunk)
                
                # Process the chunks for this post
                chunk_manager.process_post_chunks(post_chunks)
        
        # Finalize processing
        total_chunks = chunk_manager.finalize()
        
        return {
            "statusCode": 200,
            "message": f"Successfully upserted {total_chunks} chunks"
        }
        
    except Exception as e:
        print(f"Error in lambda_handler: {e}")
        raise


if __name__ == "__main__":
    event = {}
    context = None
    try:
        result = lambda_handler(event, context)
        pprint(result)
    except Exception as e:
        print(f"Error running lambda_handler: {e}")