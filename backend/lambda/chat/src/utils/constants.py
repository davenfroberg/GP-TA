SECRETS = {"PINECONE": "pinecone_key", "OPENAI": "open_ai_key"}
PINECONE_INDEX_NAME = "piazza-chunks"
AWS_REGION_NAME = "us-west-2"
MESSAGES_TABLE_NAME = "messages"
CHUNKS_TABLE_NAME = "piazza-chunks"
QUERIES_TABLE_NAME = "student-queries"
POSTS_TABLE_NAME = "piazza-posts"

EMBEDDING_MODEL = "text-embedding-3-small"

COURSES = {
    "cpsc330": "mekbcze4gyber",
    "cpsc110": "mdi1cvod8vu5hf",
    "cpsc121": "mcv0sbotg6s51",
    "cpsc404": "mdp45gef5b21ej",
    "cpsc418": "met4o2esgko2zu",
}

COURSE_DISPLAY_NAMES = {
    "cpsc330": "CPSC 330",
    "cpsc110": "CPSC 110",
    "cpsc121": "CPSC 121",
    "cpsc404": "CPSC 404",
    "cpsc418": "CPSC 418",
}

QUERY_PATTERNS = {
    "MT": r"\bmt\s*([1-3])\b",  # convert "mt" into "midterm"
    "PSET": r"\bpset\s*([1-9]|1[0-2])\b",  # convert "pset" into "problem set"
}
