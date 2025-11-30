from dataclasses import dataclass


@dataclass
class NotificationConfig:
    """Configuration for a notification"""

    recipient_email: str
