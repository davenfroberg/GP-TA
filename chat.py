
import json
from openai import OpenAI
import boto3
from botocore.exceptions import ClientError
from pinecone import Pinecone

SECRETS = {
    "PINECONE": "pinecone",
    "OPENAI": "openai"
}
AWS_REGION_NAME = "us-west-2"

classes = {
    "cpsc330": "mekbcze4gyber",
	"cpsc110": "mdi1cvod8vu5hf",
	"cpsc121": "mcv0sbotg6s51",
	"cpsc404": "mdp45gef5b21ej",
    "cpsc418": "met4o2esgko2zu"
}

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

# Setup Pinecone and OpenAI using secrets
PINECONE_API_KEY = get_secret_api_key(SECRETS['PINECONE'])
OPENAI_API_KEY = get_secret_api_key(SECRETS['OPENAI'])

pc = Pinecone(api_key=PINECONE_API_KEY)
index = pc.Index("piazza-chunks")
openai_client = OpenAI(api_key=OPENAI_API_KEY)


def get_top_chunks(query, class_id, top_k=8):
    # Search Pinecone for top chunks in the specified class
    results = index.search(
        namespace="piazza",
        query={
            "top_k": top_k,
            "filter": {
                "class_id": class_id
            },
            "inputs": {
                'text': query
            }
        }
    )
    return results['result']['hits']

# Individual context retrieval functions
def get_answer_context(table, parent_id, chunk_id):
    resp = table.query(
        KeyConditionExpression=boto3.dynamodb.conditions.Key('parent_id').eq(parent_id) & boto3.dynamodb.conditions.Key('id').eq(chunk_id)
    )
    return [item['chunk_text'] for item in resp.get('Items', [])]

def get_question_context(table, blob_id):
    resp = table.query(
        KeyConditionExpression=boto3.dynamodb.conditions.Key('parent_id').eq(blob_id)
    )
    answers = [item for item in resp.get('Items', []) if item.get('type') in ['i_answer', 's_answer', 'answer']]
    answer_chunks = {}
    for item in answers:
        answer_chunks.setdefault(item['id'], []).append(item['chunk_text'])
    i_answers = [v for k, v in answer_chunks.items() if any(item.get('type') == 'i_answer' for item in answers if item['id'] == k)]
    s_answers = [v for k, v in answer_chunks.items() if any(item.get('type') == 's_answer' for item in answers if item['id'] == k)]
    context = []
    if i_answers:
        for chunks in i_answers:
            context.append("\n".join(chunks))
    elif s_answers:
        for chunks in s_answers:
            context.append("\n".join(chunks))
    return context

def get_discussion_context(table, parent_id, blob_id, discussion_chunk_id):
    context_chunks = []
    # Get the discussion chunk
    resp = table.query(
        KeyConditionExpression=boto3.dynamodb.conditions.Key('parent_id').eq(parent_id) & boto3.dynamodb.conditions.Key('id').eq(discussion_chunk_id)
    )
    for item in resp.get('Items', []):
        context_chunks.append(item['chunk_text'])
    # Get all responses with parent_id == blob_id
    resp = table.query(
        KeyConditionExpression=boto3.dynamodb.conditions.Key('parent_id').eq(blob_id)
    )
    for item in resp.get('Items', []):
        context_chunks.append(item['chunk_text'])
    # Join all discussion chunks and responses with separator
    return "\n\n(--- discussion reply ---)\n\n".join(context_chunks)

def get_fallback_context(table, parent_id, chunk_id):
    resp = table.query(
        KeyConditionExpression=boto3.dynamodb.conditions.Key('parent_id').eq(parent_id) & boto3.dynamodb.conditions.Key('id').eq(chunk_id)
    )
    return [item['chunk_text'] for item in resp.get('Items', [])]

def get_context_from_dynamo(top_chunks):
    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table("piazza-chunks")
    all_context = []
    for chunk in top_chunks:
        fields = chunk['fields'] if 'fields' in chunk else chunk
        chunk_id = chunk['_id']
        blob_id = fields['blob_id']
        chunk_type = fields.get('type')
        parent_id = fields.get('parent_id')
        if chunk_type in ['i_answer', 's_answer', 'answer']:
            new_context = get_answer_context(table, parent_id, chunk_id)
        elif chunk_type == 'question':
            new_context = get_question_context(table, blob_id)
        elif chunk_type in ['discussion', 'followup', 'feedback']:
            new_context = get_discussion_context(table, parent_id, blob_id, chunk_id)
        else:
            new_context = get_fallback_context(table, parent_id, chunk_id)
        if isinstance(new_context, str):
            all_context.append(new_context)
        else:
            all_context.extend(new_context)
    return all_context

def ask_chatgpt(query, context_chunks):
    context = "\n\n".join(context_chunks)
    prompt = f"Context:\n{context}\n\nQuestion: {query}\nAnswer:"
    stream = openai_client.responses.create(
        model="gpt-5",
        reasoning={"effort": "low"},
        instructions="You are a helpful assistant for a student/instructor Q&A forum. Use only the provided context to answer the question. If a piece of context is not relevant to the question, ignore it. If the context does not contain enough information, inform the user that Piazza does not contain any relevant posts or information regarding the topic, and provide a potential answer but indicate uncertainty.",
        input=prompt,
        stream=True
    )

    for event in stream:
        if event.type == "response.output_text.delta":
            print(event.delta, end="", flush=True)

    return

def main():
    print("Available classes:", ", ".join(classes.keys()))
    class_input = input("Enter class name: ").strip()
    if class_input not in classes:
        print(f"Class '{class_input}' not found. Available: {', '.join(classes.keys())}")
        return
    class_id = classes[class_input]
    query = input("Question: ")
    print("Thinking...")
    top_chunks = get_top_chunks(query, class_id)
    context_chunks = get_context_from_dynamo(top_chunks)
    print("Context retrieved:")
    for i, chunk in enumerate(context_chunks):
        print(f"\n--- Context Chunk {i+1} ---\n{chunk}\n")
    ask_chatgpt(query, context_chunks)

if __name__ == "__main__":
    main()

