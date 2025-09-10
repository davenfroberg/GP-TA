
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

def get_top_embeddings(query, top_k=8):
    # Search the dense index
    results = index.search(
        namespace="piazza",
        query={
            "top_k": top_k,
            "inputs": {
                'text': query
            }
        }
    )
    context_chunks = []
    for hit in results['result']['hits']:
        context_chunks.append(hit['fields']['chunk_text'])
    return context_chunks

def ask_chatgpt(query, context_chunks):
	context = "\n\n".join(context_chunks)
	prompt = f"Context:\n{context}\n\nQuestion: {query}\nAnswer:"
	response = openai_client.responses.create(
        model="gpt-5",
        reasoning={"effort": "low"},
        instructions="You are a helpful assistant for a student/instructor Q&A forum. Use only the provided context to answer the question. If a piece of context is not relevant to the question, ignore it. If the context does not contain enough information, inform the user that you don't know, and provide a potential answer but indicate uncertainty.",
        input=prompt,
    )

	return response.output_text

def main():
	query = input("Question: ")
	context_chunks = get_top_embeddings(query)
	answer = ask_chatgpt(query, context_chunks)
	print("\nChatGPT Answer:\n", answer)

if __name__ == "__main__":
	main()
