def parse_user_id(event: dict) -> str | None:
    """Extract user_id from the event's authorizer claims."""
    request_context = event.get("requestContext", {})
    authorizer = request_context.get("authorizer", {})

    user_id = None
    if authorizer:
        jwt = authorizer.get("jwt", {})
        if jwt:
            claims = jwt.get("claims", {})
            if claims:
                user_id = claims.get("sub")

    return user_id
