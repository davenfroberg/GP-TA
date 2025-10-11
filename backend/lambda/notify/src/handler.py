from endpoints.create import create_notification
from endpoints.get import get_all_notifications
from endpoints.delete import delete_notification
def lambda_handler(event, context):
    method = event["requestContext"]["http"]["method"]
    print("starting notify handler")
    if method == "GET":
        return get_all_notifications()
    elif method == "POST":
        return create_notification(event)
    elif method == "DELETE":
        return delete_notification(event)
    else:
        return {"statusCode": 404, "body": "Not found"}