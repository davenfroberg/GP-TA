
from piazza_api import Piazza
from pprint import pprint
import json
import boto3
from botocore.exceptions import ClientError

SECRET_NAME = "piazza"
REGION_NAME = "us-west-2"

def get_piazza_credentials(secret_name=SECRET_NAME, region_name=REGION_NAME):
    session = boto3.session.Session()
    client = session.client(
        service_name='secretsmanager',
        region_name=region_name
    )
    try:
        get_secret_value_response = client.get_secret_value(SecretId=secret_name)
        secret_dict = json.loads(get_secret_value_response['SecretString'])
        username = secret_dict['username']
        password = secret_dict['password']
        return username, password
    except ClientError as e:
        print(f"Error retrieving secret: {e}")
        raise
    except Exception as e:
        print(f"Unexpected error: {e}")
        raise

def extract_post_info(post):
    info = {}
    info['post-id'] = post.get('nr', None)
    history_item = post.get('history', [{}])[0]
    info['subject'] = history_item.get('subject', '')
    info['asked_by'] = history_item.get('anon', '')
    info['date'] = history_item.get('created', '')
    info['content'] = history_item.get('content', '')
    info['tags'] = post.get('tags', [])
    info['views'] = post.get('unique_views', 0)
    answers = []

    # TODO: fix this to handle answers properly
    #       there can be an answer but there are also follow-up comments which may be answered by a professor or TA
    for child in post.get('children', []):
        if child.get('type') in ['i_answer', 'feedback']:
            child_history = child.get('history', [{}])[0]
            answer_info = {
                'responder': child_history.get('anon', ''),
                'date': child_history.get('created', ''),
                'content': child_history.get('content', ''),
                'endorsements': [e.get('name') for e in child.get('tag_endorse', [])]
            }
            answers.append(answer_info)
        if child.get('children'):
            answers.extend(extract_post_info(child)['answers'])
    info['answers'] = answers
    return info


def lambda_handler(event, context):
    username, password = get_piazza_credentials()
    p = Piazza()
    p.user_login(email=username, password=password)
    # just cpsc 330 for now while testing
    cpsc330 = p.network("mekbcze4gyber")

    # TODO: fetch posts from all classes in the student's profile
    #       use p.get_user_profile() to get list of classes

    # TODO: hash the post to tell if it's been updated since last scrape
    
    # TODO: upload new/updated post metadata to dynamodb and full content to S3

    all_posts_info = []
    for post in cpsc330.iter_all_posts(limit=10, sleep=1):
        info = extract_post_info(post)
        all_posts_info.append(info)
    return {
        "statusCode": 200,
        "message": all_posts_info
    }


if __name__ == "__main__":
    event = {}
    context = None
    try:
        result = lambda_handler(event, context)
        pprint(result)
    except Exception as e:
        print(f"Error running lambda_handler: {e}")