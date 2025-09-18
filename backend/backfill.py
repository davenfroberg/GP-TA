import boto3

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table("piazza-chunks")

def backfill_titles():
    # 1. Scan all items
    response = table.scan()
    items = response.get("Items", [])

    # Handle pagination if there are many items
    while "LastEvaluatedKey" in response:
        response = table.scan(ExclusiveStartKey=response["LastEvaluatedKey"])
        items.extend(response.get("Items", []))

    print(f"Found {len(items)} items to check")

    updated_count = 0

    # 2. Iterate over items
    for item in items:
        if not item.get("title"):  # empty or missing
            root_id = item.get("root_id")
            if not root_id:
                continue  # skip items with no root_id

            # 3. Query for root item (id = root_id#1, parent_id = root_id)
            resp = table.get_item(
                Key={
                    "parent_id": root_id,
                    "id": f"{root_id}#0"
                }
            )
            root_item = resp.get("Item")

            if root_item and "title" in root_item:
                # 4. Update the original item
                table.update_item(
                    Key={
                        "parent_id": item["parent_id"],
                        "id": item["id"]
                    },
                    UpdateExpression="SET #t = :newtitle",
                    ExpressionAttributeNames={"#t": "title"},
                    ExpressionAttributeValues={":newtitle": root_item["title"]}
                )
                updated_count += 1
                print(f"Updated item {item['id']} with title '{root_item['title']}'")

    print(f"Backfill complete. Updated {updated_count} items.")

if __name__ == "__main__":
    backfill_titles()