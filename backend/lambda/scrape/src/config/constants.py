AWS_REGION_NAME = "us-west-2"
CHUNKS_TABLE_NAME = "piazza-chunks"
POSTS_TABLE_NAME = "piazza-posts"
PINECONE_INDEX_NAME = "piazza-chunks"
PINECONE_NAMESPACE = "piazza"
DYNAMO_BATCH_GET_SIZE = 100
PINECONE_BATCH_SIZE = 25
CHUNK_SIZE_WORDS = 100

SECRETS = {
    "PIAZZA_USER": "piazza_username",
    "PIAZZA_PASS": "piazza_password",
    "PINECONE": "pinecone_key"
}