from enum import Enum

class Intent(Enum):
    GENERAL = "general"
    SUMMARIZE = "summarize"
    OVERVIEW = "overview"
    UNKNOWN = "unknown"
