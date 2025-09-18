# Script to process and empty PiazzaUpdateQueue SQS, group by course_id, fetch posts, chunk, and send to DynamoDB and Pinecone
import boto3
import json
from piazza_api import Piazza
from pinecone import Pinecone
from bs4 import BeautifulSoup
import re
import hashlib

AWS_REGION_NAME = "us-west-2"
SQS_QUEUE_URL = "https://sqs.us-west-2.amazonaws.com/112745307245/PiazzaUpdateQueue"
DYNAMO_TABLE_NAME = "piazza-chunks"
PINECONE_INDEX_NAME = "piazza-chunks"
PINECONE_NAMESPACE = "piazza"

dynamodb = boto3.resource("dynamodb")
chunk_dynamo_table = dynamodb.Table(DYNAMO_TABLE_NAME)
sqs = boto3.client("sqs", region_name=AWS_REGION_NAME)

def get_secret_api_key(secret_name, region_name=AWS_REGION_NAME):
    session = boto3.session.Session()
    client = session.client(
        service_name='secretsmanager',
        region_name=region_name
    )
    get_secret_value_response = client.get_secret_value(SecretId=secret_name)
    secret_dict = json.loads(get_secret_value_response['SecretString'])
    return secret_dict['api_key']

def get_piazza_credentials(secret_name="piazza", region_name=AWS_REGION_NAME):
    session = boto3.session.Session()
    client = session.client(
        service_name='secretsmanager',
        region_name=region_name
    )
    get_secret_value_response = client.get_secret_value(SecretId=secret_name)
    secret_dict = json.loads(get_secret_value_response['SecretString'])
    return secret_dict['username'], secret_dict['password']

def clean_text(raw_html):
    soup = BeautifulSoup(raw_html, "html.parser")
    text = soup.get_text(separator="\n")
    text = re.sub(r"&[#\w]+;", "", text)
    text = re.sub(r"\n\s*\n", "\n", text)
    return text.strip()

def extract_children(children, root_id, root_title, parent_id=None):
    blobs = []
    for child in children:
        info = {}
        history_item = child.get('history', [{}])[0]
        info['content'] = clean_text(
            history_item.get('content', '') if 'content' in history_item else child.get('subject', '')
        )
        info['date'] = history_item.get('created', child.get('created', ''))
        info['post_num'] = child.get('nr', 0)
        info['id'] = child.get('id', '')
        info['parent_id'] = parent_id
        info['type'] = child.get('type', '')
        info['root_id'] = root_id
        info['title'] = root_title # give every child the root question's title for context
        blobs.append(info)
        blobs.extend(extract_children(child.get('children', []), root_id, root_title, info['id']))
    return blobs

def get_all_question_blobs(post):
    blobs = []
    history_item = post.get('history', [{}])[0]
    root_title = history_item.get('subject', '')
    info = {}
    info['content'] = clean_text(history_item.get('content', ''))
    info['title'] = root_title
    info['date'] = history_item.get('created', '')
    info['post_num'] = post.get('nr', 0)
    info['id'] = post.get('id', '')
    info['parent_id'] = info['id']
    info['root_id'] = info['id']
    info['type'] = post.get('type', '')
    blobs.append(info)
    blobs.extend(extract_children(post.get('children', []), info['id'], root_title, info['id']))
    return blobs

def split_sentences(text):
    sentences = re.split(r'(?<=[.!?])\s+', text)
    return [s.strip() for s in sentences if s.strip()]

def generate_chunks(blob, chunk_size=100):
    text = blob['content']
    title = blob.get('title')
    sentences = split_sentences(text)
    chunks = []
    current_chunk = []
    current_len = 0
    for i, sentence in enumerate(sentences):
        sentence_len = len(sentence.split())
        if current_len + sentence_len > chunk_size and current_chunk:
            chunk_text = " ".join(current_chunk)
            if title:
                chunk_text = f"Title: {title}\n\n{chunk_text}"
            chunks.append(chunk_text)
            current_chunk = [current_chunk[-1]] if len(current_chunk) >= 1 else []
            current_len = sum(len(s.split()) for s in current_chunk)
        current_chunk.append(sentence)
        current_len += sentence_len
    if current_chunk:
        chunk_text = " ".join(current_chunk)
        if title:
            chunk_text = f"Title: {title}\n\n{chunk_text}"
        chunks.append(chunk_text)
    return chunks

def compute_hash(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()

def process_sqs_messages():
    # Receive all messages from SQS (up to 10 at a time)
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

def lambda_handler(event, context):
    piazza_username, piazza_password = get_piazza_credentials()
    p = Piazza()
    p.user_login(email=piazza_username, password=piazza_password)
    pinecone_api_key = get_secret_api_key("pinecone")
    pc = Pinecone(api_key=pinecone_api_key)
    index = pc.Index(PINECONE_INDEX_NAME)
    DYNAMO_BATCH_GET_SIZE = 100
    PINECONE_BATCH_SIZE = 25
    pinecone_batch = []
    chunk_count = 0
    # Fetch and group messages by course_id
    messages = process_sqs_messages()
    grouped = {}
    # Map post_id to SQS message for later deletion
    postid_to_msg = {}
    for msg in messages:
        body = json.loads(msg['Body'])
        course_id = body['course_id']
        post_id = body['post_id']
        grouped.setdefault(course_id, []).append(post_id)
        postid_to_msg[post_id] = msg
    print(f"Grouped posts by course: { {k: len(v) for k,v in grouped.items()} }")
    for course_id, post_ids in grouped.items():
        network = p.network(course_id)
        for post_id in post_ids:
            msg = postid_to_msg[post_id]
            try:
                post = network.get_post(post_id)
                blobs = get_all_question_blobs(post)
                post_chunks = []
                for blob in blobs:
                    chunks = generate_chunks(blob)
                    for idx, chunk_text in enumerate(chunks):
                        content_hash = compute_hash(chunk_text)
                        chunk = {
                            "id": f"{blob['id']}#{idx}",
                            "class_id": course_id,
                            "blob_id": blob['id'],
                            "chunk_index": idx,
                            "root_id": blob['root_id'],
                            "parent_id": blob['parent_id'],
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
                        {"parent_id": c['parent_id'], "id": c['id']} for c in batch
                    ]
                    response = dynamodb.batch_get_item(
                        RequestItems={DYNAMO_TABLE_NAME: {"Keys": keys_to_check}}
                    )
                    existing_items = {
                        item['id']: item for item in response['Responses'].get(DYNAMO_TABLE_NAME, [])
                    }
                    chunks_to_insert = []
                    for chunk in batch:
                        existing = existing_items.get(chunk['id'])
                        if existing and existing.get('content_hash', {}) == chunk['content_hash']:
                            print(f"Skipped duplicate chunk {chunk['id']}")
                            continue
                        chunks_to_insert.append(chunk)
                        pinecone_batch.append(chunk)
                        chunk_count += 1
                        if len(pinecone_batch) >= PINECONE_BATCH_SIZE:
                            index.upsert_records(PINECONE_NAMESPACE, pinecone_batch)
                            print(f"Upserted {len(pinecone_batch)} chunks to Pinecone")
                            pinecone_batch = []
                    with chunk_dynamo_table.batch_writer() as batch_writer:
                        for chunk in chunks_to_insert:
                            batch_writer.put_item(Item=chunk)
                            print(f"Inserted/Updated chunk {chunk['id']}")
                    if pinecone_batch:
                        index.upsert_records(PINECONE_NAMESPACE, pinecone_batch)
                        print(f"Upserted {len(pinecone_batch)} chunks to Pinecone")
                        pinecone_batch = []
                # Only delete SQS message after successful processing
                sqs.delete_message(QueueUrl=SQS_QUEUE_URL, ReceiptHandle=msg['ReceiptHandle'])
                print(f"Deleted SQS message for post_id {post_id}")
            except Exception as e:
                print(f"Error processing post_id {post_id}: {e}")
    if pinecone_batch:
        index.upsert_records(PINECONE_NAMESPACE, pinecone_batch)
        print(f"Upserted {len(pinecone_batch)} chunks to Pinecone")
    return {
        "statusCode": 200,
        "message": f"successfully upserted {chunk_count} chunks"
    }

if __name__ == "__main__":
    lambda_handler({}, None)



