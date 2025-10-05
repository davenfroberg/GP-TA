from enum import Enum

class WebSocketType(Enum):
    CHUNK = "chat_chunk"
    DONE = "chat_done"
    START = "chat_start"
    PROGRESS_UPDATE = "progress_update"
    CITATIONS = "citations"