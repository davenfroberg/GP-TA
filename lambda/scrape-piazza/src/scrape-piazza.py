
import re
from piazza_api import Piazza
from pprint import pprint
import json
import boto3
from botocore.exceptions import ClientError
from bs4 import BeautifulSoup
import hashlib

SECRET_NAME = "piazza"
REGION_NAME = "us-west-2"

def get_piazza_credentials(secret_name=SECRET_NAME, region_name=REGION_NAME):
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

def extract_children(children, parent_id=None):
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
        info['title'] = None
        blobs.append(info)
        blobs.extend(extract_children(child.get('children', []), parent_id=info['id']))
    return blobs

def get_all_post_blobs(post):
    blobs = []
    history_item = post.get('history', [{}])[0]
    info = {}
    info['content'] = clean_text(history_item.get('content', ''))
    info['title'] = history_item.get('subject', '')
    info['date'] = history_item.get('created', '')
    info['post_num'] = post.get('nr', 0)
    info['id'] = post.get('id', '')
    info['parent_id'] = None
    info['type'] = post.get('type', '')
    blobs.append(info)
    blobs.extend(extract_children(post.get('children', []), parent_id=info['id']))
    return blobs

def split_sentences(text):
    # split on sentence-ending punctuation followed by whitespace
    sentences = re.split(r'(?<=[.!?])\s+', text)
    return [s.strip() for s in sentences if s.strip()]

def generate_chunks(blob, chunk_size=100):
    """
    Split blob['content'] into chunks of roughly chunk_size words,
    with a single-sentence overlap between consecutive chunks.
    """
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

    all_chunks = []

    for cl in classes:
        class_id = cl['nid']
        network = p.network(class_id)
        for post in network.iter_all_posts(limit=10, sleep=1):
            blobs = get_all_post_blobs(post)
            for blob in blobs:
                chunks = generate_chunks(blob)
                for idx, chunk_text in enumerate(chunks):
                    content_hash = compute_hash(chunk_text)
                    s3_uri = f"s3://{class_id}/{blob['id']}/chunk_{idx}.txt"
                    # Instead of uploading, just print what would be sent
                    chunk = {
                        "class_id": class_id,
                        "post_chunk_id": f"{blob['id']}#{idx}",
                        "post_id": blob['id'],
                        "chunk_index": idx,
                        "parent_id": blob['parent_id'],
                        "type": blob['type'],
                        "title": blob['title'],
                        "s3_uri": s3_uri,
                        "date": blob['date'],
                        "content_hash": content_hash,
                        "chunk_text": chunk_text
                    }
                    all_chunks.append(chunk)

    # Write all_chunks to a file
    with open("all_chunks.json", "w", encoding="utf-8") as f:
        json.dump(all_chunks, f, ensure_ascii=False, indent=2)

    return {
        "statusCode": 200,
        "message": all_chunks
    }


if __name__ == "__main__":
    event = {}
    context = None
    try:
        result = lambda_handler(event, context)
        pprint(result)
    except Exception as e:
        print(f"Error running lambda_handler: {e}")