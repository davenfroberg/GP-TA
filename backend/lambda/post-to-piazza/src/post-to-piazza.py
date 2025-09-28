import json
from piazza_api import Piazza
import boto3
from botocore.exceptions import ClientError
from pprint import pprint

course_to_network = {
    "CPSC 110": "mdi1cvod8vu5hf",
    "CPSC 121": "mcv0sbotg6s51",
    "CPSC 330": "mekbcze4gyber",
    "CPSC 404": "mdp45gef5b21ej",
    "CPSC 418": "met4o2esgko2zu"
}

SECRETS = {
    "PIAZZA": "piazza",
}
AWS_REGION_NAME = "us-west-2"

def get_secret_api_key(secret_name, region_name=AWS_REGION_NAME):
        """Get API key from AWS Secrets Manager"""
        session = boto3.session.Session()
        client = session.client(
            service_name='secretsmanager',
            region_name=region_name
        )
        try:
            response = client.get_secret_value(SecretId=secret_name)
            secret_dict = json.loads(response['SecretString'])
            return secret_dict['api_key']
        except ClientError as e:
            print(f"Error retrieving secret: {e}")
            raise
        except Exception as e:
            print(f"Unexpected error: {e}")
            raise

def get_piazza_credentials(secret_name=SECRETS['PIAZZA'], region_name=AWS_REGION_NAME):
        """Get Piazza username and password from AWS Secrets Manager"""
        session = boto3.session.Session()
        client = session.client(
            service_name='secretsmanager',
            region_name=region_name
        )
        try:
            response = client.get_secret_value(SecretId=secret_name)
            secret_dict = json.loads(response['SecretString'])
            username = secret_dict['username']
            password = secret_dict['password']
            print("Successfully retrieved Piazza credentials from AWS secrets manager")
            return username, password
        except ClientError as e:
            print(f"Error retrieving secret: {e}")
            raise
        except Exception as e:
            print(f"Unexpected error: {e}")
            raise

def lambda_handler(event, context):
    # Handle CORS preflight requests
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            'body': ''
        }
    try:
        # Parse the request body from API Gateway
        if event.get('body'):
            body = json.loads(event['body'])
        else:
            body = {}
        
        # Extract parameters from the request body
        api_key = body.get("api_key")
        EXPECTED_KEY = get_secret_api_key("api_gateway")

        if api_key != EXPECTED_KEY:
            return {
                'statusCode': 403,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                'body': json.dumps({
                    'success': False,
                    'error': 'Invalid API key'
                })
            }
        
        course = body.get("course")
        network = course_to_network[course]
        post_type = body.get("post_type", "question")
        post_folders = body.get("post_folders")
        post_subject = body.get("post_subject")
        post_content = body.get("post_content")
        anonymous = bool(body.get("anonymous", "True"))
        
        print(f"Subject: {post_subject}")
        print(f"Course: {course}")
        print(f"Content: {post_content}")
        print(f"Folders: {post_folders}")
        print(f"Anonymous: {anonymous}")

        if not all([network, post_type, post_folders, post_subject, post_content]):
            return {
                'statusCode': 400,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                'body': json.dumps({
                    'success': False,
                    'error': 'Missing required parameters'
                })
            }

        username, password = get_piazza_credentials()
        p = Piazza()
        p.user_login(email=username, password=password)
        piazza_network = p.network(network)
        post_info = piazza_network.create_post(post_type, post_folders, post_subject, post_content, anonymous=anonymous)

        post_number = post_info['nr']
        post_link = f"https://piazza.com/class/{network}/post/{post_number}"
        
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            'body': json.dumps({
                'success': True,
                'message': 'Post created successfully',
                'post_link': post_link,
                'post_number': post_number
            })
        }
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            'body': json.dumps({
                'success': False,
                'error': str(e)
            })
        }

if __name__ == "__main__":
    # Test with a sample API Gateway event
    test_event = {
        'httpMethod': 'POST',
        'body': json.dumps({
            'api_key': 'test_key',
            'course': 'CPSC 330',
            'post_type': 'question',
            'post_folders': ['hw1'],
            'post_subject': 'Test Post',
            'post_content': 'This is a test post',
            'anonymous': True
        })
    }
    result = lambda_handler(test_event, None)
    print(json.dumps(result, indent=2))