from enums.UpdateType import UpdateType
import os
AWS_REGION_NAME = "us-west-2"
CHUNKS_TABLE_NAME = "piazza-chunks"
POSTS_TABLE_NAME = "piazza-posts"
DIFFS_TABLE_NAME = "piazza-post-diffs"
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

COURSE_NAMES = {
    "mdi1cvod8vu5hf": "CPSC 110",
    "mcv0sbotg6s51": "CPSC 121",
    "mekbcze4gyber": "CPSC 330",
    "mdp45gef5b21ej": "CPSC 404",
    "met4o2esgko2zu": "CPSC 418"
}

# Course IDs to ignore during processing
IGNORED_COURSE_IDS = {
    "meae0a6pfhq6i9" # CPSC 436N (not my piazza course)
}


MAJOR_UPDATE_TYPES = [UpdateType.NEW_QUESTION.value, UpdateType.INSTRUCTOR_ANSWER.value, UpdateType.STUDENT_ANSWER.value]
QUESTION_UPDATE_TYPES = [UpdateType.NEW_QUESTION.value, UpdateType.QUESTION_UPDATE.value]
I_ANSWER_UPDATE_TYPES = [UpdateType.INSTRUCTOR_ANSWER.value, UpdateType.INSTRUCTOR_ANSWER_UPDATE.value]
S_ANSWER_UPDATE_TYPES = [UpdateType.STUDENT_ANSWER.value, UpdateType.STUDENT_ANSWER_UPDATE.value]
DISCUSSION_TYPES = [UpdateType.FEEDBACK.value, UpdateType.FOLLOWUP.value]

SES_SOURCE_EMAIL = "GP-TA <noreply@davenfroberg.com>"
SES_RECIPIENT_EMAIL = os.environ['SES_RECP_EMAIL']