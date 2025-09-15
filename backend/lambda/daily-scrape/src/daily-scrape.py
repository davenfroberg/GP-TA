
import re
from piazza_api import Piazza
from pprint import pprint
import json
import boto3
from botocore.exceptions import ClientError
from pinecone import Pinecone
from bs4 import BeautifulSoup
import hashlib

SECRETS = {
    "PIAZZA": "piazza",
    "PINECONE": "pinecone"
}
AWS_REGION_NAME = "us-west-2"
DYNAMO_TABLE_NAME = "piazza-chunks"

PINECONE_INDEX_NAME = "piazza-chunks"
PINECONE_NAMESPACE = "piazza"

dynamodb = boto3.resource("dynamodb")
chunk_dynamo_table = dynamodb.Table("piazza-chunks")

def get_secret_api_key(secret_name, region_name=AWS_REGION_NAME):
	session = boto3.session.Session()
	client = session.client(
		service_name='secretsmanager',
		region_name=region_name
	)
	try:
		get_secret_value_response = client.get_secret_value(SecretId=secret_name)
		secret_dict = json.loads(get_secret_value_response['SecretString'])
		return secret_dict['api_key']
	except ClientError as e:
		print(f"Error retrieving secret: {e}")
		raise
	except Exception as e:
		print(f"Unexpected error: {e}")
		raise

def get_piazza_credentials(secret_name=SECRETS['PIAZZA'], region_name=AWS_REGION_NAME):
    session = boto3.session.Session()
    client = session.client(
        service_name='secretsmanager',
        region_name=region_name
    )
    try:
        get_secret_value_response = client.get_secret_value(SecretId=secret_name)
        secret_dict = json.loads(get_secret_value_response['SecretString'])
        username = secret_dict['username']
        password = secret_dict['password']
        print("Successfuly retrieved Piazza credentials from AWS secrets manager")
        return username, password
    except ClientError as e:
        print(f"Error retrieving secret: {e}")
        raise
    except Exception as e:
        print(f"Unexpected error: {e}")
        raise

def clean_text(raw_html):
    soup = BeautifulSoup(raw_html, "html.parser")
    text = soup.get_text(separator="\n")
    text = re.sub(r"&[#\w]+;", "", text)
    text = re.sub(r"\n\s*\n", "\n", text)
    return text.strip()

def extract_children(children, root_id, parent_id=None):
    blobs = []
    for child in children:
        info = {}
        history_item = child.get('history', [{}])[0]
        info['content'] = clean_text(history_item.get('content', '') if 'content' in history_item else child.get('subject', ''))
        info['date'] = history_item.get('created', child.get('created', ''))
        info['post_num'] = child.get('nr', 0)
        info['id'] = child.get('id', '')
        info['parent_id'] = parent_id
        info['type'] = child.get('type', '')
        info['root_id'] = root_id
        info['title'] = ''
        blobs.append(info)
        blobs.extend(extract_children(child.get('children', []), root_id, info['id']))
    return blobs

def get_all_question_blobs(post):
    blobs = []
    history_item = post.get('history', [{}])[0]
    info = {}
    info['content'] = clean_text(history_item.get('content', ''))
    info['title'] = history_item.get('subject', '')
    info['date'] = history_item.get('created', '')
    info['post_num'] = post.get('nr', 0)
    info['id'] = post.get('id', '')
    info['parent_id'] = info['id']
    info['root_id'] = info['id']
    info['type'] = post.get('type', '')
    blobs.append(info)
    blobs.extend(extract_children(post.get('children', []), info['id'], info['id']))
    return blobs

def split_sentences(text):
    # split on sentence-ending punctuation followed by whitespace
    sentences = re.split(r'(?<=[.!?])\s+', text)
    return [s.strip() for s in sentences if s.strip()]

def generate_chunks(blob, chunk_size=100):
    text = blob['content']
    title = blob.get('title')
    
    # Split text into sentences
    sentences = split_sentences(text)
    
    chunks = []
    current_chunk = []
    current_len = 0

    for i, sentence in enumerate(sentences):
        sentence_len = len(sentence.split())
        
        # Check if adding this sentence would exceed chunk size
        if current_len + sentence_len > chunk_size and current_chunk:
            # Finalize current chunk
            chunk_text = " ".join(current_chunk)
            if title:
                chunk_text = f"Title: {title}\n\n{chunk_text}"
            chunks.append(chunk_text)
            
            # Start new chunk with previous sentence as overlap
            current_chunk = [current_chunk[-1]] if len(current_chunk) >= 1 else []
            current_len = sum(len(s.split()) for s in current_chunk)

        current_chunk.append(sentence)
        current_len += sentence_len

    # Add any remaining sentences as the last chunk
    if current_chunk:
        chunk_text = " ".join(current_chunk)
        if title:
            chunk_text = f"Title: {title}\n\n{chunk_text}"
        chunks.append(chunk_text)

    return chunks

def compute_hash(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()

def lambda_handler(event, context):
    username, password = get_piazza_credentials()
    p = Piazza()
    p.user_login(email=username, password=password)
    classes = p.get_user_classes()

    pinecone_api_key = get_secret_api_key("pinecone")
    pc = Pinecone(api_key=pinecone_api_key)
    index = pc.Index("piazza-chunks")
    
    DYNAMO_BATCH_GET_SIZE = 100
    PINECONE_BATCH_SIZE = 25

    pinecone_batch = []
    chunk_count = 0

    for cl in classes:
        class_id = cl['nid']
        network = p.network(class_id)
        
        for post in network.iter_all_posts(limit=None, sleep=1):
            # get all blobs (question, answers, discussions, followups, etc.) from a piazza post
            blobs = get_all_question_blobs(post)
            post_chunks = []

            # generate all chunks for the post's blobs
            for blob in blobs:
                chunks = generate_chunks(blob)
                for idx, chunk_text in enumerate(chunks):
                    content_hash = compute_hash(chunk_text)
                    chunk = {
                        "id": f"{blob['id']}#{idx}", # chunk id
                        "class_id": class_id,
                        "blob_id": blob['id'],
                        "chunk_index": idx,
                        "root_id": blob['root_id'], # root question id
                        "parent_id": blob['parent_id'], # direct parent id
                        "type": blob['type'],
                        "title": blob['title'],
                        "date": blob['date'],
                        "content_hash": content_hash,
                        "chunk_text": chunk_text,
                    }
                    post_chunks.append(chunk)

            # Batch-get existing chunks to avoid duplicate inserts
            for i in range(0, len(post_chunks), DYNAMO_BATCH_GET_SIZE):
                batch = post_chunks[i:i + DYNAMO_BATCH_GET_SIZE]
                keys_to_check = [
                    {"parent_id": c['parent_id'], "id": c['id']}
                    for c in batch
                ]

                response = dynamodb.batch_get_item(
                    RequestItems={"piazza-chunks": {"Keys": keys_to_check}}
                )

                existing_items = {
                    item['id']: item
                    for item in response['Responses'].get('piazza-chunks', [])
                }

                # Only insert/update chunks that are new or have a different hash
                chunks_to_insert = []
                for chunk in batch:
                    existing = existing_items.get(chunk['id'])
                    if existing and existing.get('content_hash', {}) == chunk['content_hash']:
                        print(f"Skipped duplicate chunk {chunk['id']}")
                        continue

                    chunks_to_insert.append(chunk)
                    pinecone_batch.append(chunk)
                    chunk_count += 1

                    # Flush Pinecone batch if it reaches the defined size to avoid reaching Pinecone limit
                    if len(pinecone_batch) >= PINECONE_BATCH_SIZE:
                        index.upsert_records(PINECONE_NAMESPACE, pinecone_batch)
                        print(f"Upserted {len(pinecone_batch)} chunks to Pinecone")
                        pinecone_batch = []

                # Batch-write new/updated chunks to DynamoDB
                with chunk_dynamo_table.batch_writer() as batch_writer:
                    for chunk in chunks_to_insert:
                        batch_writer.put_item(Item=chunk)
                        print(f"Inserted/Updated chunk {chunk['id']}")
                
                # Flush Pinecone batch at end of every DynamoDB batch write
                if pinecone_batch:
                    index.upsert_records(PINECONE_NAMESPACE, pinecone_batch)
                    print(f"Upserted {len(pinecone_batch)} chunks to Pinecone")
                    pinecone_batch = []

    # Flush remaining Pinecone batch
    if pinecone_batch:
        index.upsert_records(PINECONE_NAMESPACE, pinecone_batch)
        print(f"Upserted {len(pinecone_batch)} chunks to Pinecone")

    return {
        "statusCode": 200,
        "message": f"successfully upserted {chunk_count} chunks"
    }

if __name__ == "__main__":
    event = {}
    context = None
    try:
        result = lambda_handler(event, context)
        pprint(result)
    except Exception as e:
        print(f"Error running lambda_handler: {e}")