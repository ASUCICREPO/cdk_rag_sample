# SPDX-License-Identifier: MIT
"""
Feedback Handler Lambda — Learning Navigator

Stores thumbs up/down ratings on individual chatbot responses.
Validates rating value, extracts user_role from JWT claims,
and persists feedback record in DynamoDB.

Requirements: 8.2
"""

import base64
import json
import os
import time
from datetime import datetime, timezone

import boto3

# ---------------------------------------------------------------------------
# Module-level clients
# ---------------------------------------------------------------------------
dynamodb = boto3.resource("dynamodb")

# ---------------------------------------------------------------------------
# Environment variables
# ---------------------------------------------------------------------------
FEEDBACK_TABLE_NAME = os.environ.get("FEEDBACK_TABLE_NAME", "")
USER_POOL_ID = os.environ.get("USER_POOL_ID", "")
REGION = os.environ.get("REGION", os.environ.get("AWS_REGION", "us-east-1"))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _log(step: str, status: str, message: str) -> None:
    print(json.dumps({"timestamp": datetime.now(timezone.utc).isoformat(),
                       "step": step, "status": status, "message": message}))


def _cors_headers() -> dict:
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
    }


def _resp(status_code: int, body: dict) -> dict:
    return {
        "statusCode": status_code,
        "headers": {**_cors_headers(), "Content-Type": "application/json"},
        "body": json.dumps(body),
    }


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------
def _base64url_decode(data: str) -> bytes:
    padding = 4 - len(data) % 4
    if padding != 4:
        data += "=" * padding
    return base64.urlsafe_b64decode(data)


def _validate_jwt(token: str) -> dict:
    """Lightweight JWT validation: structure, expiry, issuer, token_use."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return {}
        payload = json.loads(_base64url_decode(parts[1]))
        expected_iss = f"https://cognito-idp.{REGION}.amazonaws.com/{USER_POOL_ID}"
        if payload.get("iss") != expected_iss:
            return {}
        if payload.get("exp", 0) < time.time():
            return {}
        if payload.get("token_use", "") not in ("id", "access"):
            return {}
        return payload
    except Exception:
        return {}


def _extract_role(claims: dict) -> str:
    role = claims.get("custom:role", "").lower().strip()
    return role if role in ("instructor", "internal_staff", "learner") else "learner"


# ---------------------------------------------------------------------------
# Lambda Handler
# ---------------------------------------------------------------------------
VALID_RATINGS = {"positive", "negative"}


def lambda_handler(event: dict, context) -> dict:
    """
    Entry point for the Feedback Handler Lambda.
    Requirements: 8.2
    """
    method = event.get("httpMethod", "") or event.get(
        "requestContext", {}).get("http", {}).get("method", "")
    if method == "OPTIONS":
        return _resp(200, {})

    # --- JWT validation ---
    headers = event.get("headers", {})
    auth = headers.get("authorization", headers.get("Authorization", ""))
    token = auth[7:] if auth.startswith("Bearer ") else ""
    if not token:
        return _resp(401, {"error": "Authentication required"})

    claims = _validate_jwt(token)
    if not claims:
        return _resp(401, {"error": "Authentication required"})

    user_role = _extract_role(claims)

    # --- Parse body ---
    try:
        body = json.loads(event.get("body", "{}") or "{}")
    except (json.JSONDecodeError, TypeError):
        return _resp(400, {"error": "Invalid request body"})

    # --- Validate fields ---
    message_id = body.get("message_id", "").strip()
    if not message_id:
        return _resp(400, {"error": "Missing required field: message_id"})

    session_id = body.get("session_id", "").strip()
    if not session_id:
        return _resp(400, {"error": "Missing required field: session_id"})

    rating = body.get("rating", "").strip().lower()
    if not rating:
        return _resp(400, {"error": "Missing required field: rating"})
    if rating not in VALID_RATINGS:
        return _resp(400, {"error": "Rating must be 'positive' or 'negative'"})

    # --- Store feedback ---
    if not FEEDBACK_TABLE_NAME:
        _log("handler", "error", "FEEDBACK_TABLE_NAME not configured")
        return _resp(500, {"error": "Internal server error"})

    try:
        table = dynamodb.Table(FEEDBACK_TABLE_NAME)
        table.put_item(Item={
            "message_id": message_id,
            "session_id": session_id,
            "rating": rating,
            "user_role": user_role,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        _log("handler", "success", f"Feedback stored for message_id={message_id}")
    except Exception as exc:
        _log("handler", "error", f"DynamoDB write failed: {exc}")
        return _resp(500, {"error": "Internal server error"})

    return _resp(200, {"status": "recorded"})
