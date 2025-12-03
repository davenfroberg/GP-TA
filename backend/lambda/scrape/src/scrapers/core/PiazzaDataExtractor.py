from datetime import datetime
from zoneinfo import ZoneInfo

from piazza_api.network import Network
from scrapers.core.TextProcessor import TextProcessor


class PiazzaDataExtractor:
    """Handles Piazza data extraction and processing"""

    def __init__(self, network: Network) -> None:
        self.network = network
        self.person_name_cache = {}

    @staticmethod
    def _normalize_piazza_date(date_str: str) -> str:
        """Normalize Piazza date string to ISO 8601 format with timezone.

        Piazza dates may come in various formats. This ensures consistent ISO format.
        """
        if not date_str:
            return ""

        try:
            # Try parsing as ISO format (Piazza typically uses ISO with Z)
            if date_str.endswith("Z"):
                dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            else:
                dt = datetime.fromisoformat(date_str)

            # Ensure timezone info exists
            if dt.tzinfo is None:
                # Assume UTC if no timezone info
                dt = dt.replace(tzinfo=ZoneInfo("UTC"))

            # Return in ISO format
            return dt.isoformat()
        except (ValueError, AttributeError):
            # If parsing fails, return as-is (better than crashing)
            return date_str

    @staticmethod
    def is_endorsed(post: dict) -> bool:
        """Check if a post is endorsed by an instructor"""
        endorsements = post.get("tag_endorse", [])
        for endorsement in endorsements:
            if endorsement.get("admin", False):
                return True
        return False

    def get_name_from_userid(self, userid: str) -> str:
        """Get user name from user ID with caching"""
        if userid == "":
            return "Anonymous"
        if userid in self.person_name_cache:
            return self.person_name_cache[userid]

        user = self.network.get_users([userid])[0]
        if user:
            self.person_name_cache[userid] = user.get("name", "Unknown User")
            return self.person_name_cache[userid]
        return "Unknown User"

    def extract_children(
        self,
        children: list[dict],
        root_id: str,
        root_title: str,
        parent_id: str,
        root_post_number: int,
    ) -> list[dict]:
        """Recursively extract child posts (answers, followups, etc.)"""
        blobs = []
        for child in children:
            history_item = child.get("history", [{}])[0]

            blob_info = {
                "content": TextProcessor.clean_html_text(
                    history_item.get("content", "")
                    if "content" in history_item
                    else child.get("subject", "")
                ),
                "date": PiazzaDataExtractor._normalize_piazza_date(
                    history_item.get("created", child.get("created", ""))
                ),
                "post_num": root_post_number,  # children get the same post number as root
                "id": child.get("id", ""),
                "parent_id": parent_id,
                "type": child.get("type", ""),
                "is_endorsed": "yes"
                if (child.get("type") == "s_answer" and self.is_endorsed(child))
                else "no"
                if child.get("type") == "s_answer"
                else "n/a",  # only student answers can be endorsed
                "root_id": root_id,
                "title": root_title,
                "person_id": history_item.get("uid", "anonymous"),
                "person_name": self.get_name_from_userid(history_item.get("uid", "")),
            }

            blobs.append(blob_info)

            # Recursively process children
            blobs.extend(
                self.extract_children(
                    child.get("children", []),
                    root_id,
                    root_title,
                    blob_info["id"],
                    root_post_number,
                )
            )
        return blobs

    def extract_all_post_blobs(self, post: dict) -> list[dict]:
        """Extract all blobs (question + answers + followups) from a Piazza post"""
        history_item = post.get("history", [{}])[0]
        root_title = history_item.get("subject", "")

        # Extract root question
        root_blob = {
            "content": TextProcessor.clean_html_text(history_item.get("content", "")),
            "title": root_title,
            "person_id": history_item.get("uid", "anonymous"),
            "person_name": self.get_name_from_userid(history_item.get("uid", "")),
            "is_endorsed": "n/a",  # only student answers can be endorsed
            "date": PiazzaDataExtractor._normalize_piazza_date(history_item.get("created", "")),
            "post_num": post.get("nr", 0),
            "id": post.get("id", ""),
            "parent_id": post.get("id", ""),
            "root_id": post.get("id", ""),
            "type": post.get("type", ""),
        }

        blobs = [root_blob]

        # Extract children (answers, followups, etc.)
        blobs.extend(
            self.extract_children(
                post.get("children", []),
                root_blob["id"],
                root_title,
                root_blob["id"],
                root_blob["post_num"],
            )
        )

        return blobs
