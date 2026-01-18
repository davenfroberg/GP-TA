SECRETS = {"PINECONE": "pinecone_key", "OPENAI": "open_ai_key"}
PINECONE_INDEX_NAME = "piazza-chunks"
AWS_REGION_NAME = "us-west-2"
MESSAGES_TABLE_NAME = "messages"
CHUNKS_TABLE_NAME = "piazza-chunks"
QUERIES_TABLE_NAME = "student-queries"
POSTS_TABLE_NAME = "piazza-posts"

EMBEDDING_MODEL = "text-embedding-3-small"

COURSES = {
    "cpsc410": "mj7lmga4dwt40p",
    "cpsc110": "mjxdv7l3glb5ri",
    "cpsc121": "miqhst79nme76u",
    "cpsc436s": "mfd1u2cai713sh",
    "biol112": "mjxhkb5ev4a16n",
    "cpsc440": "mk0uk8835r31ic",
    "cpsc221": "mjrxls4whx72xp",
}

COURSE_DISPLAY_NAMES = {
    "cpsc410": "CPSC 410",
    "cpsc110": "CPSC 110",
    "cpsc121": "CPSC 121",
    "cpsc436s": "CPSC 436S",
    "biol112": "BIO 112",
    "cpsc440": "CPSC 440",
    "cpsc221": "CPSC 221",
}

QUERY_PATTERNS = {
    "MT": r"\bmt\s*([1-3])\b",  # convert "mt" into "midterm"
    "PSET": r"\bpset\s*([1-9]|1[0-2])\b",  # convert "pset" into "problem set"
}
