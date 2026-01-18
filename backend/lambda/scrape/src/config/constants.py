import os

from enums.UpdateType import UpdateType

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
    "PINECONE": "pinecone_key",
}

COURSE_NAMES = {
    "mjxdv7l3glb5ri": "CPSC 110",
    "miqhst79nme76u": "CPSC 121",
    "mfd1u2cai713sh": "CPSC 436S",
    "mjxhkb5ev4a16n": "BIO 112",
    "mk0uk8835r31ic": "CPSC 440",
    "mjrxls4whx72xp": "CPSC 221",
    "mj7lmga4dwt40p": "CPSC 410",
}


# Course IDs to ignore during processing
IGNORED_COURSE_IDS = {}


MAJOR_UPDATE_TYPES = [
    UpdateType.NEW_QUESTION.value,
    UpdateType.INSTRUCTOR_ANSWER.value,
    UpdateType.STUDENT_ANSWER.value,
]
QUESTION_UPDATE_TYPES = [UpdateType.NEW_QUESTION.value, UpdateType.QUESTION_UPDATE.value]
I_ANSWER_UPDATE_TYPES = [
    UpdateType.INSTRUCTOR_ANSWER.value,
    UpdateType.INSTRUCTOR_ANSWER_UPDATE.value,
]
S_ANSWER_UPDATE_TYPES = [UpdateType.STUDENT_ANSWER.value, UpdateType.STUDENT_ANSWER_UPDATE.value]
DISCUSSION_TYPES = [UpdateType.FEEDBACK.value, UpdateType.FOLLOWUP.value]

SES_SOURCE_EMAIL = "GP-TA <noreply@gp-ta.ca>"
SES_RECIPIENT_EMAIL = os.environ["SES_RECP_EMAIL"]
