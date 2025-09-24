# Script to process and empty PiazzaUpdateQueue SQS, group by course_id, fetch posts, chunk, and send to DynamoDB and Pinecone
import boto3
import json
from piazza_api import Piazza
from pinecone import Pinecone
from bs4 import BeautifulSoup
import re
import hashlib
from typing import List, Dict, Any, Tuple

# Configuration Constants
AWS_REGION_NAME = "us-west-2"
SQS_QUEUE_URL = "https://sqs.us-west-2.amazonaws.com/112745307245/PiazzaUpdateQueue"
DYNAMO_TABLE_NAME = "piazza-chunks"
PINECONE_INDEX_NAME = "piazza-chunks"
PINECONE_NAMESPACE = "piazza"
DYNAMO_BATCH_GET_SIZE = 100
PINECONE_BATCH_SIZE = 25
CHUNK_SIZE_WORDS = 100

# Initialize AWS clients
dynamodb = boto3.resource("dynamodb")
chunk_dynamo_table = dynamodb.Table(DYNAMO_TABLE_NAME)
sqs = boto3.client("sqs", region_name=AWS_REGION_NAME)


def get_secret_api_key(secret_name: str, region_name: str = AWS_REGION_NAME) -> str:
    """Retrieve API key from AWS Secrets Manager."""
    session = boto3.session.Session()
    client = session.client(
        service_name='secretsmanager',
        region_name=region_name
    )
    response = client.get_secret_value(SecretId=secret_name)
    secret_dict = json.loads(response['SecretString'])
    return secret_dict['api_key']


def get_piazza_credentials(secret_name: str = "piazza", region_name: str = AWS_REGION_NAME) -> Tuple[str, str]:
    """Retrieve Piazza username and password from AWS Secrets Manager."""
    session = boto3.session.Session()
    client = session.client(
        service_name='secretsmanager',
        region_name=region_name
    )
    response = client.get_secret_value(SecretId=secret_name)
    secret_dict = json.loads(response['SecretString'])
    return secret_dict['username'], secret_dict['password']


def clean_text(raw_html: str) -> str:
    """Clean HTML content and return plain text."""
    soup = BeautifulSoup(raw_html, "html.parser")
    text = soup.get_text(separator="\n")
    text = re.sub(r"&[#\w]+;", "", text)
    text = re.sub(r"\n\s*\n", "\n", text)
    return text.strip()


def extract_children(children: List[Dict], root_id: str, root_title: str, parent_id: str = None) -> List[Dict]:
    """Recursively extract children posts and format them as blobs."""
    blobs = []
    
    for child in children:
        history_item = child.get('history', [{}])[0]
        
        blob = {
            'content': clean_text(
                history_item.get('content', '') if 'content' in history_item else child.get('subject', '')
            ),
            'date': history_item.get('created', child.get('created', '')),
            'post_num': child.get('nr', 0),
            'id': child.get('id', ''),
            'parent_id': parent_id,
            'type': child.get('type', ''),
            'root_id': root_id,
            'title': root_title  # Give every child the root question's title for context
        }
        
        blobs.append(blob)
        blobs.extend(extract_children(child.get('children', []), root_id, root_title, blob['id']))
    
    return blobs


def get_all_question_blobs(post: Dict) -> List[Dict]:
    """Extract all blobs from a post including root question and children."""
    history_item = post.get('history', [{}])[0]
    root_title = history_item.get('subject', '')
    
    # Create root blob
    root_blob = {
        'content': clean_text(history_item.get('content', '')),
        'title': root_title,
        'date': history_item.get('created', ''),
        'post_num': post.get('nr', 0),
        'id': post.get('id', ''),
        'parent_id': post.get('id', ''),
        'root_id': post.get('id', ''),
        'type': post.get('type', '')
    }
    
    blobs = [root_blob]
    blobs.extend(extract_children(post.get('children', []), root_blob['id'], root_title, root_blob['id']))
    
    return blobs


def split_sentences(text: str) -> List[str]:
    """Split text into sentences."""
    sentences = re.split(r'(?<=[.!?])\s+', text)
    return [sentence.strip() for sentence in sentences if sentence.strip()]


def generate_chunks(blob: Dict, chunk_size: int = CHUNK_SIZE_WORDS) -> List[str]:
    """Generate text chunks from a blob with overlapping sentences."""
    text = blob['content']
    title = blob.get('title')
    sentences = split_sentences(text)
    
    chunks = []
    current_chunk = []
    current_len = 0
    
    for sentence in sentences:
        sentence_len = len(sentence.split())
        
        # If adding this sentence would exceed chunk size and we have content, finalize chunk
        if current_len + sentence_len > chunk_size and current_chunk:
            chunk_text = " ".join(current_chunk)
            if title:
                chunk_text = f"Title: {title}\n\n{chunk_text}"
            chunks.append(chunk_text)
            
            # Start new chunk with last sentence for overlap
            current_chunk = [current_chunk[-1]] if current_chunk else []
            current_len = sum(len(s.split()) for s in current_chunk)
        
        current_chunk.append(sentence)
        current_len += sentence_len
    
    # Add final chunk
    if current_chunk:
        chunk_text = " ".join(current_chunk)
        if title:
            chunk_text = f"Title: {title}\n\n{chunk_text}"
        chunks.append(chunk_text)
    
    return chunks


def compute_hash(text: str) -> str:
    """Compute SHA256 hash of text."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def process_sqs_messages() -> List[Dict]:
    """Fetch all messages from the SQS queue."""
    all_messages = []
    
    while True:
        response = sqs.receive_message(
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


def create_chunk_object(blob: Dict, idx: int, chunk_text: str, course_id: str) -> Dict:
    """Create a chunk object with all required metadata."""
    return {
        "id": f"{blob['id']}#{idx}",
        "class_id": course_id,
        "blob_id": blob['id'],
        "chunk_index": idx,
        "root_id": blob['root_id'],
        "parent_id": blob['parent_id'],
        "type": blob['type'],
        "title": blob['title'],
        "date": blob['date'],
        "content_hash": compute_hash(chunk_text),
        "chunk_text": chunk_text,
    }


def process_chunks_batch(post_chunks: List[Dict], index, pinecone_batch: List[Dict]) -> Tuple[List[Dict], int]:
    """Process a batch of chunks, checking for duplicates and preparing for insertion."""
    chunks_to_insert = []
    chunk_count = 0
    
    for i in range(0, len(post_chunks), DYNAMO_BATCH_GET_SIZE):
        batch = post_chunks[i:i + DYNAMO_BATCH_GET_SIZE]
        keys_to_check = [{"parent_id": c['parent_id'], "id": c['id']} for c in batch]
        
        # Check for existing chunks
        response = dynamodb.batch_get_item(
            RequestItems={DYNAMO_TABLE_NAME: {"Keys": keys_to_check}}
        )
        
        existing_items = {
            item['id']: item for item in response['Responses'].get(DYNAMO_TABLE_NAME, [])
        }
        
        # Filter out duplicates
        for chunk in batch:
            existing = existing_items.get(chunk['id'])
            if existing and existing.get('content_hash') == chunk['content_hash']:
                print(f"Skipped duplicate chunk {chunk['id']}")
                continue
            
            chunks_to_insert.append(chunk)
            pinecone_batch.append(chunk)
            chunk_count += 1
            
            # Upsert to Pinecone when batch is full
            if len(pinecone_batch) >= PINECONE_BATCH_SIZE:
                index.upsert_records(PINECONE_NAMESPACE, pinecone_batch)
                print(f"Upserted {len(pinecone_batch)} chunks to Pinecone")
                pinecone_batch.clear()
        
        # Insert new chunks to DynamoDB
        if chunks_to_insert:
            with chunk_dynamo_table.batch_writer() as batch_writer:
                for chunk in chunks_to_insert:
                    batch_writer.put_item(Item=chunk)
                    print(f"Inserted/Updated chunk {chunk['id']}")
            chunks_to_insert.clear()
    
    return pinecone_batch, chunk_count


def process_course_posts(course_id: str, post_ids: List[str], postid_to_msg: Dict, 
                        network, index, pinecone_batch: List[Dict]) -> Tuple[List[Dict], int]:
    """Process all posts for a specific course."""
    total_chunk_count = 0
    
    for post_id in post_ids:
        msg = postid_to_msg[post_id]
        
        try:
            # Fetch and process post
            post = network.get_post(post_id)
            blobs = get_all_question_blobs(post)
            
            # Generate chunks for all blobs
            post_chunks = []
            for blob in blobs:
                chunks = generate_chunks(blob)
                for idx, chunk_text in enumerate(chunks):
                    chunk = create_chunk_object(blob, idx, chunk_text, course_id)
                    post_chunks.append(chunk)
            
            # Process chunks in batches
            pinecone_batch, chunk_count = process_chunks_batch(post_chunks, index, pinecone_batch)
            total_chunk_count += chunk_count
            
            # Delete SQS message after successful processing
            sqs.delete_message(QueueUrl=SQS_QUEUE_URL, ReceiptHandle=msg['ReceiptHandle'])
            print(f"Deleted SQS message for post_id {post_id}")
            
        except Exception as e:
            print(f"Error processing post_id {post_id}: {e}")
    
    return pinecone_batch, total_chunk_count


def lambda_handler(event, context):
    """Main Lambda handler function."""
    # Initialize services
    piazza_username, piazza_password = get_piazza_credentials()
    p = Piazza()
    p.user_login(email=piazza_username, password=piazza_password)
    
    pinecone_api_key = get_secret_api_key("pinecone")
    pc = Pinecone(api_key=pinecone_api_key)
    index = pc.Index(PINECONE_INDEX_NAME)
    
    # Process messages
    messages = process_sqs_messages()
    grouped, postid_to_msg = group_messages_by_course(messages)
    
    pinecone_batch = []
    total_chunk_count = 0
    
    # Process each course
    for course_id, post_ids in grouped.items():
        network = p.network(course_id)
        pinecone_batch, chunk_count = process_course_posts(
            course_id, post_ids, postid_to_msg, network, index, pinecone_batch
        )
        total_chunk_count += chunk_count
    
    # Upload any remaining chunks to Pinecone
    if pinecone_batch:
        index.upsert_records(PINECONE_NAMESPACE, pinecone_batch)
        print(f"Upserted {len(pinecone_batch)} chunks to Pinecone")
    
    return {
        "statusCode": 200,
        "message": f"Successfully upserted {total_chunk_count} chunks"
    }


if __name__ == "__main__":
    lambda_handler({}, None)