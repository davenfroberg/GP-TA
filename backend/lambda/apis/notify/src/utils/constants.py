PINECONE_INDEX_NAME = "piazza-chunks"
AWS_REGION_NAME = "us-west-2"
NOTIFICATIONS_TABLE_NAME = "followed-queries"
SENT_TABLE_NAME = "notifications-sent"
MESSAGES_TABLE_NAME = "messages"

SECRETS = {"PINECONE": "pinecone_key"}

COURSES = {
    "cpsc410": "mj7lmga4dwt40p",
    "cpsc110": "mjxdv7l3glb5ri",
    "cpsc121": "miqhst79nme76u",
    "cpsc436s": "mfd1u2cai713sh",
    "biol112": "mjxhkb5ev4a16n",
    "cpsc440": "mk0uk8835r31ic",
    "cpsc221": "mjrxls4whx72xp",
}

THRESHOLD_ADDER = 0.1
MIN_THRESHOLD = 0.38
MAX_THRESHOLD = 0.45
MAX_NOTIFICATIONS = 3  # the max number of notifications to notify at once
