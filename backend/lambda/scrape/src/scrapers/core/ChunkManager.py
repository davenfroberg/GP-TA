from config.constants import (
    CHUNKS_TABLE_NAME,
    DYNAMO_BATCH_GET_SIZE,
    PINECONE_BATCH_SIZE,
    PINECONE_NAMESPACE,
)
from config.logger import logger
from scrapers.core.TextProcessor import TextProcessor


class ChunkManager:
    """Manages chunk creation, deduplication, and storage"""

    def __init__(self, pinecone_index, dynamodb, chunk_dynamo_table):
        self.pinecone_index = pinecone_index
        self.dynamodb = dynamodb
        self.chunk_dynamo_table = chunk_dynamo_table
        self.pinecone_batch = []
        self.chunk_count = 0

    def create_chunk(self, blob, chunk_index, chunk_text, course_id):
        """Create a chunk dictionary from blob data"""
        content_hash = TextProcessor.compute_hash(chunk_text)

        return {
            "id": f"{blob['id']}#{chunk_index}",
            "class_id": course_id,  # keep this as class_id for now for backwards compatibility
            "blob_id": blob["id"],
            "chunk_index": chunk_index,
            "root_id": blob["root_id"],
            "parent_id": blob["parent_id"],
            "root_post_num": blob["post_num"],
            "is_endorsed": blob["is_endorsed"],
            "person_id": blob["person_id"],
            "person_name": blob["person_name"],
            "type": blob["type"],
            "title": blob["title"],
            "date": blob["date"],
            "content_hash": content_hash,
            "chunk_text": chunk_text,
        }

    def process_post_chunks(self, post_chunks):
        """Process chunks for a single post with deduplication"""
        for i in range(0, len(post_chunks), DYNAMO_BATCH_GET_SIZE):
            post_batch = post_chunks[i : i + DYNAMO_BATCH_GET_SIZE]

            # Check for existing chunks in DynamoDB
            existing_chunks = self._get_existing_chunks(post_batch)

            # Filter out duplicates and process new/updated chunks
            chunks_to_insert = self._filter_new_chunks(post_batch, existing_chunks)

            if chunks_to_insert:
                self._store_chunks(chunks_to_insert)

    def _get_existing_chunks(self, batch):
        """Get existing chunks from DynamoDB"""
        keys_to_check = [{"parent_id": chunk["parent_id"], "id": chunk["id"]} for chunk in batch]

        response = self.dynamodb.batch_get_item(
            RequestItems={CHUNKS_TABLE_NAME: {"Keys": keys_to_check}}
        )

        return {item["id"]: item for item in response["Responses"].get(CHUNKS_TABLE_NAME, [])}

    def _filter_new_chunks(self, batch, existing_chunks):
        """Filter out chunks that haven't changed"""
        chunks_to_insert = []

        for chunk in batch:
            existing = existing_chunks.get(chunk["id"])
            if existing and existing.get("content_hash") == chunk["content_hash"]:
                logger.debug("Skipped duplicate chunk", extra={"chunk_id": chunk["id"]})
                continue

            chunks_to_insert.append(chunk)
            self.pinecone_batch.append(chunk)
            self.chunk_count += 1

            # Flush Pinecone batch if needed
            if len(self.pinecone_batch) >= PINECONE_BATCH_SIZE:
                self._flush_pinecone_batch()

        return chunks_to_insert

    def _store_chunks(self, chunks_to_insert):
        """Store chunks in DynamoDB"""
        with self.chunk_dynamo_table.batch_writer() as batch_writer:
            for chunk in chunks_to_insert:
                batch_writer.put_item(Item=chunk)
                logger.debug("Inserted or updated chunk", extra={"chunk_id": chunk["id"]})

        # Flush Pinecone batch after DynamoDB write
        if self.pinecone_batch:
            self._flush_pinecone_batch()

    def _flush_pinecone_batch(self):
        """Flush current batch to Pinecone"""
        if self.pinecone_batch:
            self.pinecone_index.upsert_records(PINECONE_NAMESPACE, self.pinecone_batch)
            logger.info(
                "Upserted chunks to Pinecone", extra={"chunk_count": len(self.pinecone_batch)}
            )
            self.pinecone_batch = []

    def finalize(self):
        """Flush any remaining chunks and return count"""
        self._flush_pinecone_batch()
        return self.chunk_count
