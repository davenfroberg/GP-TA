PINECONE_INDEX_NAME = "piazza-chunks"
AWS_REGION_NAME = "us-west-2"
NOTIFICATIONS_TABLE_NAME = "followed-queries"
SENT_TABLE_NAME = "notifications-sent"

SECRETS = {"PINECONE": "pinecone_key"}

COURSES = {
    "cpsc330": "mekbcze4gyber",
    "cpsc110": "mdi1cvod8vu5hf",
    "cpsc121": "mcv0sbotg6s51",
    "cpsc404": "mdp45gef5b21ej",
    "cpsc418": "met4o2esgko2zu",
}

THRESHOLD_ADDER = 0.1
MIN_THRESHOLD = 0.38
MAX_THRESHOLD = 0.45
MAX_NOTIFICATIONS = 3  # the max number of notifications to notify at once
