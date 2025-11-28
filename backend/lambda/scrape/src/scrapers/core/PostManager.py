from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from config.constants import MAJOR_UPDATE_TYPES, QUESTION_UPDATE_TYPES, I_ANSWER_UPDATE_TYPES, S_ANSWER_UPDATE_TYPES, DISCUSSION_TYPES, SES_RECIPIENT_EMAIL, COURSE_NAMES
from enums.UpdateType import UpdateType
from dto.NotificationConfig import NotificationConfig
from dto.AnnouncementPostConfig import AnnouncementPostConfig

class PostManager:
    """Manages Piazza posts, tracking content changes over time."""
    
    def __init__(self, dynamo, posts_table, diffs_table, notification_service):
        self.dynamodb = dynamo
        self.posts_table = posts_table
        self.diffs_table = diffs_table
        self.notification_service = notification_service


    def get_discussion_content(self, post, change_id):
        # I can recurse through the entire tree structure which isn't super quick but there aren't gonna be enough discussions for it to really matter efficiency-wise
        print(f"Looking for discussion with change_id: {change_id}")
        def dfs(root):
            children = root.get('children', [])
            for child in children:
                if child.get('type') not in DISCUSSION_TYPES:
                    continue
                if child.get('id') == change_id:
                    # for some reason, discussion content is in the subject field
                    print(f"Found {child.get('id')}!")
                    print(f"Subject: {child.get("subject")}")
                    return child.get("subject")
                search_result = dfs(child)
                if search_result is not False:
                    return search_result
                
            return False
        
        res = dfs(post)
        if res is not False:
            return res
        else:
            print(f"FAILED TO FIND DISCUSSION WITH CHANGE_ID: {change_id}")
            return ""


    def get_post_content(self, change, post):
        change_type = change.get("type")
        post_subject = None
        post_content = None
        
        if change_type in QUESTION_UPDATE_TYPES:
            history_object = post.get("history")[0]
            print("Getting create/update content")

            post_subject = history_object.get("subject")
            post_content = history_object.get("content") # this is uncleaned HTML and MD
        
        elif change_type in I_ANSWER_UPDATE_TYPES:
            for child in post.get("children", []):
                if child.get("type") == UpdateType.INSTRUCTOR_ANSWER.value:
                    print("Getting i_answer content")
                    history_object = child.get("history")[0]

                    post_content = history_object.get("content") # this is uncleaned HTML and MD
                    break
            
        elif change_type in S_ANSWER_UPDATE_TYPES:
            for child in post.get("children", []):
                if child.get("type") == UpdateType.STUDENT_ANSWER.value:
                    print("Getting s_answer content")
                    history_object = child.get("history")[0]

                    post_content = history_object.get("content") # this is uncleaned HTML and MD
                    break
        else:
            post_content = self.get_discussion_content(post, change.get("cid"))
        
        return (post_subject if post_subject else "", post_content)
        

    # process one change from the list of changes
    def handle_individual_change(self, change, post, course_id, sequence):
        post_id = post.get('id')
        pk = f"{course_id}#{post_id}"
        sk = f"{self.now}#{sequence}"

        change_type = change.get('type')
        subject, content = self.get_post_content(change, post)
        
        self.diffs_table.put_item(
            Item={
                "course_id#post_id": pk,
                "timestamp": sk,
                "course_id": course_id,
                "post_id": post_id,
                "type": change_type,
                "subject": subject,
                "content": content
            }
        )

        # returns True if major change, else False
        return change_type in MAJOR_UPDATE_TYPES


    # set the last update time, last major update time
    def set_update_times(self, post, course_id, had_major_update):
        post_id = post.get('id')
        key = {"course_id": course_id, "post_id": post_id}

        if had_major_update:
            update_expr = "SET last_major_update = :lm, last_updated = :lu"
            expr_values = {":lm": str(self.now), ":lu": str(self.now)}
        else:
            update_expr = "SET last_updated = :lu"
            expr_values = {":lu": str(self.now)}

        try:
            self.posts_table.update_item(
                Key=key,
                UpdateExpression=update_expr,
                ExpressionAttributeValues=expr_values
            )
        except Exception as e:
            action = "last_major_update and last_updated" if had_major_update else "last_updated"
            print(f"[ERROR] Failed to update {action} for {course_id}#{post_id}: {e}")


    def put_new_diffs(self, new_post, course_id, old_num_changes):
        new_change_log = new_post.get('change_log')
        
        # no changes if the lengths are the same
        if len(new_change_log) == old_num_changes:
            return
        
        # older changes are earlier in the list, so get everything after the last old change
        new_changes = new_change_log[old_num_changes:]

        had_major_update = False
        
        # because handle_individual_changes merges any updates (or creations), only handle the first one which will then merge the rest
        question_handled = False
        i_answer_handled = False
        s_answer_handled = False
        
        sequence = 0
        for change in new_changes:
            change_type = change.get('type')
            if change_type in QUESTION_UPDATE_TYPES:
                if question_handled:
                    continue
                question_handled = True
            elif change_type in I_ANSWER_UPDATE_TYPES:
                if i_answer_handled:
                    continue
                i_answer_handled = True
            elif change_type in S_ANSWER_UPDATE_TYPES:
                if s_answer_handled:
                    continue
                s_answer_handled = True

            had_major_update = self.handle_individual_change(change, new_post, course_id, sequence) or had_major_update
            sequence += 1
        
        self.set_update_times(new_post, course_id, had_major_update)

    def _should_notify(self, post):        
        is_announcement = bool(post.get('config', {}).get('is_announcement', 0))
        post_creation_time = post.get('created')
        if is_announcement == False:
            print("Not an announcement post")
        
        if not is_announcement or not post_creation_time:
            return False
        
        post_datetime = datetime.fromisoformat(post_creation_time.replace('Z', '+00:00'))
        
        now = datetime.now(timezone.utc)
        
        time_difference = now - post_datetime
        within_48_hours = time_difference <= timedelta(hours=48)
        
        if within_48_hours == False:
            print("It is an announcement post but not within 48 hours")
            
        return is_announcement and within_48_hours
        
    def handle_new_post(self, post, course_id):
        post_id = post.get('id')
        change_log = post.get('change_log')
        is_announcement = bool(post.get('config').get('is_announcement', 0))
        self.posts_table.put_item(
            Item={
                "course_id": course_id,
                "post_id": post_id,
                "course_name": COURSE_NAMES[course_id],
                "post_title": post.get('history')[0].get('subject'),
                "last_updated": str(self.now),
                "last_major_update": str(self.now),
                "num_changes": len(change_log),
                "is_announcement": is_announcement,
                "current_summary": None, # this is set when the summarizer runs
                "summary_last_updated": "1970-01-01T00:00:00Z", # summarizer should find posts with summary_last_updated < last_major_update OR == None
                "needs_new_summary": False # should the summarizer reset the summary? Set to True after user asks for summary
            }
        )
        # put a "new post" event in the diffs table
        # `old_num_changes` is set to 0 for brand new posts
        self.put_new_diffs(post, course_id, 0)

        if self._should_notify(post):
            notification_config = NotificationConfig(
                recipient_email=SES_RECIPIENT_EMAIL
            )

            history_object = post.get('history')[0]

            announcement = AnnouncementPostConfig(
                course_id=course_id,
                course_name=COURSE_NAMES[course_id],
                post_id=post_id,
                post_number=post.get('nr'),
                post_subject=history_object.get('subject'),
                post_content=history_object.get('content')
            )

            self.notification_service.send_email_notification(notification_config, announcement)


    def handle_existing_post(self, old_post, new_post, course_id):
        old_num_changes = int(old_post.get('num_changes'))
        self.put_new_diffs(new_post, course_id, old_num_changes)
        
        post_id = new_post.get('id')
        new_change_log = new_post.get('change_log')
        
        self.posts_table.update_item(
            Key={'course_id': course_id, 'post_id': post_id},
            UpdateExpression='SET num_changes = :nc',
            ExpressionAttributeValues={':nc': len(new_change_log)}
        )
    

    def process_post(self, new_post, course_id):
        # set global 'now' to have the same time throughout processing
        self.now = datetime.now(ZoneInfo("America/Los_Angeles"))

        post_id = new_post.get('id')
        
        try:
            response = self.posts_table.get_item(
                Key={
                    'course_id': course_id,
                    'post_id': post_id
                }
            )
            existing_post = response.get('Item')
        except Exception as e:
            print(f"[ERROR] Failed to fetch post course_id: {course_id}, post_id: {post_id} -- {e}")
            existing_post = None
        
        if existing_post:
            self.handle_existing_post(existing_post, new_post, course_id)
        else:
            self.handle_new_post(new_post, course_id)
        