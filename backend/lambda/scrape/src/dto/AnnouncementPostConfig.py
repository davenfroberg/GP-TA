from dataclasses import dataclass

@dataclass
class AnnouncementPostConfig:
      """Configuration for a post which is an announcement"""
      course_name: str
      course_id: str
      post_id: str
      post_number: int
      post_subject: str
      post_content: str
