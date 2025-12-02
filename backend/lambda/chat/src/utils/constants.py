SECRETS = {"PINECONE": "pinecone_key", "OPENAI": "open_ai_key"}
PINECONE_INDEX_NAME = "piazza-chunks"
AWS_REGION_NAME = "us-west-2"

POSTS_TABLE_NAME = "piazza-posts"

COURSES = {
    "cpsc330": "mekbcze4gyber",
    "cpsc110": "mdi1cvod8vu5hf",
    "cpsc121": "mcv0sbotg6s51",
    "cpsc404": "mdp45gef5b21ej",
    "cpsc418": "met4o2esgko2zu",
}

QUERY_PATTERNS = {
    "MT": r"\bmt\s*([1-3])\b",  # convert "mt" into "midterm"
    "PSET": r"\bpset\s*([1-9]|1[0-2])\b",  # convert "pset" into "problem set"
}
