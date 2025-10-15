PINECONE_INDEX_NAME = "piazza-chunks"
AWS_REGION_NAME = "us-west-2"
DYNAMO_TABLE_NAME = "notifications"

SECRETS = {
    "PINECONE": "pinecone"
}

CLASSES = {
    "cpsc330": "mekbcze4gyber",
    "cpsc110": "mdi1cvod8vu5hf",
    "cpsc121": "mcv0sbotg6s51",
    "cpsc404": "mdp45gef5b21ej",
    "cpsc418": "met4o2esgko2zu"
}

THRESHOLD_MULTIPLIER = 1.45
MIN_THRESHOLD = 0.5
MAX_THRESHOLD = 0.85
MAX_NOTIFICATIONS = 3 # the max number of notifications to notify at once