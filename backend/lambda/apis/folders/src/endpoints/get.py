import json
import urllib.parse

import boto3
from botocore.exceptions import ClientError
from piazza_api import Piazza
from utils.constants import AWS_REGION_NAME, COURSE_TO_ID, SECRETS
from utils.logger import logger


def get_piazza_credentials(
    username_secret: str = SECRETS["PIAZZA_USER"],
    password_secret: str = SECRETS["PIAZZA_PASS"],
    region_name: str = AWS_REGION_NAME,
) -> tuple[str, str]:
    session = boto3.session.Session()
    client = session.client(service_name="ssm", region_name=region_name)
    try:
        logger.debug("Retrieving Piazza credentials from Parameter Store")
        username_response = client.get_parameter(Name=username_secret, WithDecryption=True)
        password_response = client.get_parameter(Name=password_secret, WithDecryption=True)
        username = username_response["Parameter"]["Value"]
        password = password_response["Parameter"]["Value"]

        logger.debug("Successfully retrieved Piazza credentials from Parameter Store")
        return username, password
    except ClientError:
        logger.exception("Failed to retrieve Piazza credentials from Parameter Store")
        raise
    except Exception:
        logger.exception("Unexpected error retrieving Piazza credentials")
        raise


def process_folders(folder_list: list[str]) -> list[dict]:
    folder_map: dict[str, dict] = {}
    all_child_names: set[str] = set()
    all_parent_names: set[str] = set()

    for folder_path in folder_list:
        normalized_path = folder_path.replace("∕", "/")
        if "/" in normalized_path:
            parts = normalized_path.split("/")
            parent = parts[0]
            child_path = "/".join(parts[1:])
            all_child_names.add(child_path)
            all_parent_names.add(parent)

            if parent not in folder_map:
                folder_map[parent] = {"name": parent, "children": []}
            elif "children" not in folder_map[parent]:
                folder_map[parent]["children"] = []

            if child_path not in folder_map[parent]["children"]:
                folder_map[parent]["children"].append(child_path)

    for folder_path in folder_list:
        normalized_path = folder_path.replace("∕", "/")  # replace Unicode division slash with /
        if "/" not in normalized_path:
            if folder_path not in all_child_names:
                if folder_path not in folder_map:
                    folder_map[folder_path] = {"name": folder_path}

    result = []
    for folder_name in sorted(folder_map.keys()):
        folder = folder_map[folder_name].copy()
        if "children" in folder:
            if folder["children"]:
                folder["children"] = sorted(folder["children"])
            else:
                del folder["children"]
        result.append(folder)

    logger.info(
        "Processed folders",
        extra={
            "input_count": len(folder_list),
            "output_count": len(result),
            "sample_input": folder_list[:20] if folder_list else [],
            "sample_output": [
                {"name": f["name"], "children_count": len(f.get("children", []))}
                for f in result[:10]
            ],
            "all_parent_names": list(all_parent_names)[:10],
            "all_child_names": list(all_child_names)[:10],
        },
    )
    return result


def get_folders(course: str) -> dict:
    headers = {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"}

    try:
        course = urllib.parse.unquote(course)
        course_key = course.lower().replace(" ", "")

        network = COURSE_TO_ID.get(course_key)
        if not network:
            logger.warning(
                "Course not found in COURSE_TO_ID mapping",
                extra={"course": course, "course_key": course_key},
            )
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"error": f'Course "{course}" not found'}),
            }

        try:
            username, password = get_piazza_credentials()
        except Exception:
            logger.exception("Failed to retrieve Piazza credentials")
            return {
                "statusCode": 500,
                "headers": headers,
                "body": json.dumps(
                    {"error": "Internal server error: Failed to retrieve credentials"}
                ),
            }

        p = Piazza()
        p.user_login(email=username, password=password)
        piazza_network = p.network(network)

        feed_result = piazza_network.get_feed()

        instructor_tags = feed_result.get("tags", {}).get("instructor", [])

        logger.debug(
            "Fetched instructor tags",
            extra={
                "tag_count": len(instructor_tags),
                "sample_tags": instructor_tags[:10] if instructor_tags else [],
            },
        )

        if not instructor_tags:
            logger.warning(
                "No instructor tags found in feed", extra={"course": course, "network": network}
            )
            return {
                "statusCode": 200,
                "headers": headers,
                "body": json.dumps([]),
            }

        folders = process_folders(instructor_tags)

        logger.info(
            "Successfully fetched folders",
            extra={
                "course": course,
                "course_key": course_key,
                "network": network,
                "folder_count": len(folders),
                "sample_folders": [
                    {"name": f["name"], "has_children": bool(f.get("children"))}
                    for f in folders[:10]
                ],
                "sample_input_tags": instructor_tags[:20],
            },
        )

        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps(folders),
        }

    except Exception:
        logger.exception("Failed to get folders")
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": "Internal server error"}),
        }
