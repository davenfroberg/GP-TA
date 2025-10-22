import boto3

class PostManager:
    """Manages all raw posts, their diffs, and their summaries"""
    def __init__(self, dynamo, table):
        self.dynamodb = dynamo
        self.table = table
        self.s3 = boto3.client('s3')

    def process_post(self, post):
        pass