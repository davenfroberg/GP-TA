import os
from functools import cache
from typing import Any

import requests
from jose import jwk, jwt
from utils.logger import logger

# Get Cognito User Pool ID from environment variable
COGNITO_USER_POOL_ID = os.environ.get("COGNITO_USER_POOL_ID")
COGNITO_REGION = os.environ.get("COGNITO_REGION", "us-west-2")


@cache
def get_jwks() -> dict[str, Any]:
    if not COGNITO_USER_POOL_ID:
        raise RuntimeError("COGNITO_USER_POOL_ID environment variable not set")

    jwks_url = f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}/.well-known/jwks.json"

    try:
        response = requests.get(jwks_url, timeout=10)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        logger.exception("Failed to fetch Cognito JWKS", extra={"jwks_url": jwks_url})
        raise RuntimeError(f"Failed to fetch Cognito JWKS: {e}") from e


def get_signing_key(token: str, jwks: dict[str, Any]) -> Any:
    try:
        # Decode the token header without verification
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")

        if not kid:
            raise ValueError("Token header missing 'kid' (key ID)")

        # Find the matching key in JWKS
        for key in jwks.get("keys", []):
            if key.get("kid") == kid:
                # Construct the public key from the JWK
                return jwk.construct(key)

        raise ValueError(f"No matching key found for kid: {kid}")
    except Exception as e:
        logger.exception("Error getting signing key", extra={"error": str(e)})
        raise ValueError(f"Failed to get signing key: {e}") from e


def verify_cognito_jwt(token: str) -> dict[str, Any]:
    if not COGNITO_USER_POOL_ID:
        raise RuntimeError("COGNITO_USER_POOL_ID environment variable not set")

    try:
        jwks = get_jwks()

        public_key = get_signing_key(token, jwks)

        # This will raise an exception if the token is invalid or expired
        issuer = f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}"
        claims = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            audience=None,  # Cognito ID tokens don't always have audience
            issuer=issuer,
            options={
                "verify_signature": True,
                "verify_exp": True,
                "verify_iss": True,
                "verify_aud": False,  # Disable audience verification for ID tokens
            },
        )

        token_use = claims.get("token_use")
        if token_use not in ["id", "access"]:
            raise ValueError(f"Invalid token_use: {token_use}. Expected 'id' or 'access'")

        return claims

    except jwt.ExpiredSignatureError as e:
        raise ValueError(f"Token has expired: {e}") from e
    except jwt.JWTClaimsError as e:
        raise ValueError(f"Token claims validation failed: {e}") from e
    except jwt.JWTError as e:
        raise ValueError(f"JWT verification failed: {e}") from e
    except Exception as e:
        logger.exception("Unexpected error verifying JWT", extra={"error": str(e)})
        raise ValueError(f"Failed to verify token: {e}") from e
