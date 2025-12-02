import json
import re
from datetime import datetime
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

from botocore.exceptions import ClientError
from utils.constants import QUERY_PATTERNS
from utils.logger import logger


def get_secret_api_key(client, secret_name: str) -> str:
    """Retrieve API key from AWS Parameter Store."""
    try:
        response = client.get_parameter(Name=secret_name, WithDecryption=True)
        return response["Parameter"]["Value"]
    except ClientError as e:
        logger.exception(
            "Failed to retrieve credentials from Parameter Store",
            extra={"secret_name": secret_name},
        )
        raise RuntimeError(f"Failed to retrieve credentials from Parameter Store: {e}") from e
    except Exception:
        logger.exception("Unexpected error retrieving secret", extra={"secret_name": secret_name})
        raise


def send_websocket_message(apigw_management, connection_id: str, message_data: dict) -> None:
    """Send a message through the WebSocket connection."""
    try:
        apigw_management.post_to_connection(
            Data=json.dumps(message_data), ConnectionId=connection_id
        )
    except Exception:
        logger.exception(
            "Error sending WebSocket message",
            extra={"connection_id": connection_id, "message_type": message_data.get("type")},
        )
        raise


def normalize_query(query: str) -> str:
    q = re.sub(QUERY_PATTERNS["MT"], r"midterm \1", query, flags=re.I)
    q = re.sub(QUERY_PATTERNS["PSET"], r"problem set \1", q, flags=re.I)
    return q


def save_student_query(
    table: Any,
    course_id: str,
    query_id: str,
    raw_query: str,
    normalized_query: str,
    embedding: list[float],
    embedding_model: str,
    intent: str,
    gpt_model: str,
    connection_id: str,
    processing_time_ms: int,
    # General query specific fields
    prioritize_instructor: bool | None = None,
    needs_more_context: bool | None = None,
    num_chunks_retrieved: int | None = None,
    top_chunk_score: float | None = None,
    avg_chunk_score: float | None = None,
    top_chunk_scores: list[float] | None = None,
    num_citations: int | None = None,
    citation_post_numbers: list[int] | None = None,
    # Summarize query specific fields
    num_summaries_processed: int | None = None,
    summary_days: int | None = None,
) -> None:
    """Save a student query to DynamoDB with all relevant metadata."""
    try:
        now = datetime.now(ZoneInfo("America/Los_Angeles")).isoformat()

        # Convert embedding floats to Decimals for DynamoDB compatibility
        embedding_decimals = [Decimal(str(val)) for val in embedding]

        item = {
            "course_id": course_id,
            "query_id": query_id,
            "query": raw_query,
            "normalized_query": normalized_query,
            "embedding": embedding_decimals,
            "embedding_model": embedding_model,
            "intent": intent,
            "gpt_model": gpt_model,
            "connection_id": connection_id,
            "created_at": now,
            "processing_time_ms": processing_time_ms,
        }

        # general query specific fields
        if prioritize_instructor is not None:
            item["prioritize_instructor"] = prioritize_instructor
        if needs_more_context is not None:
            item["needs_more_context"] = needs_more_context
        if num_chunks_retrieved is not None:
            item["num_chunks_retrieved"] = num_chunks_retrieved
        if top_chunk_score is not None:
            item["top_chunk_score"] = Decimal(str(top_chunk_score))
        if avg_chunk_score is not None:
            item["avg_chunk_score"] = Decimal(str(avg_chunk_score))
        if top_chunk_scores is not None:
            item["top_chunk_scores"] = [Decimal(str(score)) for score in top_chunk_scores]
        if num_citations is not None:
            item["num_citations"] = num_citations
        if citation_post_numbers is not None:
            item["citation_post_numbers"] = citation_post_numbers

        # summarize query specific fields
        if num_summaries_processed is not None:
            item["num_summaries_processed"] = num_summaries_processed
        if summary_days is not None:
            item["summary_days"] = summary_days

        table.put_item(Item=item)
        logger.debug(
            "Saved student query to DynamoDB",
            extra={"course_id": course_id, "query_id": query_id, "intent": intent},
        )
    except Exception:
        logger.exception(
            "Failed to save student query to DynamoDB",
            extra={"course_id": course_id, "query_id": query_id},
        )
