from abc import ABC, abstractmethod
import boto3
from scrapers.core.AWSSecretsManager import AWSSecretsManager
from config.constants import DYNAMO_TABLE_NAME, SECRETS, PINECONE_INDEX_NAME
from scrapers.core.ChunkManager import ChunkManager
from pinecone import Pinecone
from piazza_api import Piazza

class AbstractScraper(ABC):

    piazza = None
    chunk_manager = None

    def __init__(self):
        secrets_manager = AWSSecretsManager()
        piazza_username, piazza_password = secrets_manager.get_piazza_credentials()

        self.piazza = Piazza()
        self.piazza.user_login(email=piazza_username, password=piazza_password)

        dynamodb = boto3.resource("dynamodb")
        table = dynamodb.Table(DYNAMO_TABLE_NAME)

        pinecone_api_key = secrets_manager.get_secret_api_key(SECRETS["PINECONE"])
        pinecone_index = Pinecone(api_key=pinecone_api_key).Index(PINECONE_INDEX_NAME)

        self.chunk_manager = ChunkManager(pinecone_index, dynamodb, table)

    @abstractmethod
    def scrape(self):
        pass