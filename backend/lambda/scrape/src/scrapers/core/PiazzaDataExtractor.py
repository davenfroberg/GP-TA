from scrapers.core.TextProcessor import TextProcessor

class PiazzaDataExtractor:
    """Handles Piazza data extraction and processing"""
    
    def __init__(self, network):
        self.network = network
        self.person_name_cache = {}
    
    def get_name_from_userid(self, userid):
        """Get user name from user ID with caching"""
        if userid == '':
            return "Anonymous"
        if userid in self.person_name_cache:
            return self.person_name_cache[userid]
        
        user = self.network.get_users([userid])[0]
        if user:
            self.person_name_cache[userid] = user.get('name', 'Unknown User')
            return self.person_name_cache[userid]
        return "Unknown User"

    @staticmethod
    def is_endorsed(post):
        """Check if a post is endorsed by an instructor"""
        endorsements = post.get('tag_endorse', [])
        for endorsement in endorsements:
            if endorsement.get('admin', False):
                return True
        return False
    
    def extract_children(self, children, root_id, root_title, parent_id, root_post_number):
        """Recursively extract child posts (answers, followups, etc.)"""
        blobs = []
        for child in children:
            history_item = child.get('history', [{}])[0]
            
            blob_info = {
                'content': TextProcessor.clean_html_text(
                    history_item.get('content', '') if 'content' in history_item else child.get('subject', '')
                ),
                'date': history_item.get('created', child.get('created', '')),
                'post_num': root_post_number, # children get the same post number as root
                'id': child.get('id', ''),
                'parent_id': parent_id,
                'type': child.get('type', ''),
                'is_endorsed': 'yes' if (child.get('type') == 's_answer' and self.is_endorsed(child)) else 'no' if child.get('type') == 's_answer' else 'n/a', # only student answers can be endorsed
                'root_id': root_id,
                'title': root_title,
                'person_id': history_item.get('uid', 'anonymous'),
                'person_name': self.get_name_from_userid(history_item.get('uid', ''))
            }
            
            blobs.append(blob_info)
            
            # Recursively process children
            blobs.extend(
                self.extract_children(
                    child.get('children', []), 
                    root_id, 
                    root_title, 
                    blob_info['id'], 
                    root_post_number
                )
            )
        return blobs

    def extract_all_post_blobs(self, post):
        """Extract all blobs (question + answers + followups) from a Piazza post"""
        history_item = post.get('history', [{}])[0]
        root_title = history_item.get('subject', '')
        
        # Extract root question
        root_blob = {
            'content': TextProcessor.clean_html_text(history_item.get('content', '')),
            'title': root_title,
            'person_id': history_item.get('uid', 'anonymous'),
            'person_name': self.get_name_from_userid(history_item.get('uid', '')),
            'is_endorsed': 'n/a',  # only student answers can be endorsed
            'date': history_item.get('created', ''),
            'post_num': post.get('nr', 0),
            'id': post.get('id', ''),
            'parent_id': post.get('id', ''),
            'root_id': post.get('id', ''),
            'type': post.get('type', '')
        }
        
        blobs = [root_blob]
        
        # Extract children (answers, followups, etc.)
        blobs.extend(
            self.extract_children(
                post.get('children', []), 
                root_blob['id'], 
                root_title, 
                root_blob['id'], 
                root_blob['post_num']
            )
        )
        
        return blobs