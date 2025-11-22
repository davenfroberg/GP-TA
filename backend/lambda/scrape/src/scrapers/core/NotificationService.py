from dto.NotificationConfig import NotificationConfig
from dto.AnnouncementPostConfig import AnnouncementPostConfig
from config.constants import SES_SOURCE_EMAIL, AWS_REGION_NAME
import boto3
import logging
import html
import re
from html.parser import HTMLParser

logger = logging.getLogger()
logger.setLevel(logging.INFO)


class HTMLTextExtractor(HTMLParser):
    """Extract plain text from HTML content"""
    def __init__(self):
        super().__init__()
        self.text = []
    
    def handle_data(self, data):
        self.text.append(data)
    
    def get_text(self):
        # Join and normalize whitespace
        text = ''.join(self.text)
        text = re.sub(r'\s+', ' ', text)
        return text.strip()


class NotificationService:
    def __init__(self):
        self.ssm_client = boto3.client('ssm')
        self.ses = boto3.client('ses', region_name=AWS_REGION_NAME)

    def send_email_notification(self, config: NotificationConfig, announcement: AnnouncementPostConfig) -> bool:
        """Send email notification via SES"""
        subject = f"Piazza announcement @{announcement.post_number} for {announcement.course_name}"
        
        text_body = self._build_text_body(announcement)
        html_body = self._build_html_body(announcement)
        
        try:
            self.ses.send_email(
                Source=f"{announcement.course_name} on {SES_SOURCE_EMAIL}",
                Destination={'ToAddresses': [config.recipient_email]},
                Message={
                    'Subject': {'Data': subject, 'Charset': 'UTF-8'},
                    'Body': {
                        'Text': {'Data': text_body, 'Charset': 'UTF-8'},
                        'Html': {'Data': html_body, 'Charset': 'UTF-8'}
                    }
                }
            )
            logger.info(f"Email sent successfully to {config.recipient_email} for post_id={announcement.post_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send email to {config.recipient_email} for post_id={announcement.post_id}: {str(e)}")
            return False
    
    def _sanitize_html_content(self, content: str) -> str:
        """Remove images and other problematic content from HTML"""
        content = html.unescape(content)
        
        content = re.sub(r'<img[^>]*>', '<span style="color: #666; font-style: italic;">[Image - view on Piazza]</span>', content, flags=re.IGNORECASE)
        
        content = re.sub(r'<iframe[^>]*>.*?</iframe>', '<span style="color: #666; font-style: italic;">[Embedded content - view on Piazza]</span>', content, flags=re.IGNORECASE | re.DOTALL)
        
        return content
    
    def _has_images(self, content: str) -> bool:
        """Check if content contains images"""
        return bool(re.search(r'<img[^>]*>', content, re.IGNORECASE))
    
    def _build_text_body(self, announcement: AnnouncementPostConfig) -> str:
        """Build plain text email body for course announcement"""
        post_url = f"https://piazza.com/class/{announcement.course_id}/post/{announcement.post_id}"
        
        extractor = HTMLTextExtractor()
        decoded_content = html.unescape(announcement.post_content)
        extractor.feed(decoded_content)
        plain_content = extractor.get_text()
        
        # truncate if too long
        max_length = 500
        if len(plain_content) > max_length:
            plain_content = plain_content[:max_length].rsplit(' ', 1)[0] + "..."
        
        has_images = self._has_images(announcement.post_content)
        image_notice = "\n\n[This announcement contains images. View on Piazza to see all media.]\n" if has_images else ""
        
        return (
            f"Hello,\n\n"
            f"A new course announcement has been posted in {announcement.course_name}.\n\n"
            f"Subject: {html.unescape(announcement.post_subject)}\n\n"
            f"{plain_content}\n"
            f"{image_notice}\n"
            f"View the full announcement here: {post_url}\n\n"
            f"Happy learning!\n"
            f"- The GP-TA Team"
        )

    def _build_html_body(self, announcement: AnnouncementPostConfig) -> str:
        """Build HTML email body for course announcement"""
        post_url = f"https://piazza.com/class/{announcement.course_id}/post/{announcement.post_id}"
        
        decoded_subject = html.unescape(announcement.post_subject)
        decoded_content = self._sanitize_html_content(announcement.post_content)
        
        has_images = self._has_images(announcement.post_content)
        
        image_notice = ""
        if has_images:
            image_notice = f"""
            <div class="content-notice">
                This announcement contains images. 
                <a href="{post_url}">View on Piazza</a> to see all media.
            </div>
            """
        
        return f"""
                <html>
                <head>
                    <style>
                        body {{
                            font-family: Arial, sans-serif;
                            line-height: 1.6;
                            color: #333333;
                            max-width: 800px;
                            margin: 0 auto;
                            padding: 20px;
                        }}
                        .announcement-content {{
                            background-color: #ffffff;
                            padding: 20px;
                            border-left: 4px solid #1a73e8;
                            margin: 20px 0;
                        }}
                        .content-notice {{
                            background-color: #fff3cd;
                            border-left: 4px solid #ffc107;
                            padding: 12px;
                            margin: 15px 0;
                            font-size: 14px;
                        }}
                        .cta-button {{
                            display: inline-block;
                            background-color: #1a73e8;
                            color: white !important;
                            padding: 12px 24px;
                            text-decoration: none;
                            border-radius: 5px;
                            margin-top: 20px;
                        }}
                        .cta-button:hover {{
                            background-color: #1557b0;
                            text-decoration: none;
                        }}
                        a {{
                            color: #1a73e8;
                            text-decoration: none;
                        }}
                        a:hover {{
                            text-decoration: underline;
                        }}
                    </style>
                </head>
                <body>
                    
                    <p>Hello,</p>
                    <p>A new announcement has been posted in <strong>{html.escape(announcement.course_name)}</strong>:</p>
                    
                    <div class="announcement-content">
                        <h3 style="margin-top: 0;">{html.escape(decoded_subject)}</h3>
                        {decoded_content}
                    </div>
                    
                    {image_notice}
                    
                    <a href="{post_url}" class="cta-button">View Full Announcement on Piazza</a>
                    
                    <p style="margin-top: 30px;">Happy learning!<br>- The GP-TA Team</p>
                </body>
                </html>
                """