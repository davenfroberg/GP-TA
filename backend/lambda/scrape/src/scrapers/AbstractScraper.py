from abc import ABC, abstractmethod
import boto3
from config.logger import logger
from scrapers.core.AWSParameterStore import AWSParameterStore
from config.constants import CHUNKS_TABLE_NAME, POSTS_TABLE_NAME, DIFFS_TABLE_NAME, SECRETS, PINECONE_INDEX_NAME
from scrapers.core.ChunkManager import ChunkManager
from scrapers.core.PostManager import PostManager
from scrapers.core.NotificationService import NotificationService
from pinecone import Pinecone
from piazza_api import Piazza

class AbstractScraper(ABC):
    def __init__(self):
        logger.debug("Initializing AbstractScraper dependencies")
        ssm = AWSParameterStore()
        piazza_username, piazza_password = ssm.get_piazza_credentials()

        self.piazza = Piazza()
        self.piazza.user_login(email=piazza_username, password=piazza_password)
        logger.debug("Authenticated to Piazza API")

        dynamodb = boto3.resource("dynamodb")
        chunks_table = dynamodb.Table(CHUNKS_TABLE_NAME)
        posts_table = dynamodb.Table(POSTS_TABLE_NAME)
        diffs_table = dynamodb.Table(DIFFS_TABLE_NAME)
        logger.debug("Initialized DynamoDB resources", extra={"tables": [CHUNKS_TABLE_NAME, POSTS_TABLE_NAME, DIFFS_TABLE_NAME]})

        pinecone_api_key = ssm.get_secret_api_key(SECRETS["PINECONE"])
        pinecone_index = Pinecone(api_key=pinecone_api_key).Index(PINECONE_INDEX_NAME)
        logger.debug("Initialized Pinecone index", extra={"index_name": PINECONE_INDEX_NAME})

        notification_service = NotificationService()

        self.chunk_manager = ChunkManager(pinecone_index, dynamodb, chunks_table)
        self.post_manager = PostManager(dynamodb, posts_table, diffs_table, notification_service)

    @abstractmethod
    def scrape(self, event):
        pass