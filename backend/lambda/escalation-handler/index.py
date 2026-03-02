# SPDX-License-Identifier: MIT
"""
Escalation Handler Lambda — Learning Navigator

Records escalation requests with conversation context for human follow-up.
Validates required fields, extracts user_role from JWT claims,
and persists escalation record in DynamoDB with status="pending".

Requirements: 5.2
"""

import base64
import json
import os
import re
import time
import uuid
from datetime import datetime, timezone

import boto3

# ---------------------------------------------------------------------------
# Module-level clients
# ---------------------------------------------------------------------------
dynamodb = boto3.resource("dynamodb")

# ---------------------------------------------------------------------------
# Environment variables
# ---------------------------------------------------------------------------
ESCALATIONS_TABLE_NAME = os.environ.get("ESCALATIONS_TABLE_NAME", "")
USER_POOL_ID = os.environ.get("USER_POOL_ID", "")
REGION = os.environ.get("REGION", os.environ.get("AWS_REGION", "us-east-1"))

# ---------------------------------------------------------------------------
# Email validation
# ---------------------------------------------------------------------------
_VALID_EMAIL_RE = re.compile(
    r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$"
)


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
def lambda_handler(event: dict, context) -> dict:
    """
    Entry point for the Escalation Handler Lambda.
    Requirements: 5.2
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
    session_id = body.get("session_id", "").strip()
    if not session_id:
        return _resp(400, {"error": "Missing required field: session_id"})

    summary = body.get("summary", "").strip()
    if not summary:
        return _resp(400, {"error": "Missing required field: summary"})

    contact_email = body.get("contact_email", "").strip()
    if not contact_email:
        return _resp(400, {"error": "Missing required field: contact_email"})
    if not _VALID_EMAIL_RE.match(contact_email):
        return _resp(400, {"error": "Invalid email format"})

    # --- Store escalation ---
    if not ESCALATIONS_TABLE_NAME:
        _log("handler", "error", "ESCALATIONS_TABLE_NAME not configured")
        return _resp(500, {"error": "Internal server error"})

    escalation_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()

    try:
        table = dynamodb.Table(ESCALATIONS_TABLE_NAME)
        table.put_item(Item={
            "escalation_id": escalation_id,
            "created_at": created_at,
            "session_id": session_id,
            "summary": summary,
            "user_role": user_role,
            "contact_email": contact_email,
            "status": "pending",
        })
        _log("handler", "success", f"Escalation created: {escalation_id}")
    except Exception as exc:
        _log("handler", "error", f"DynamoDB write failed: {exc}")
        return _resp(500, {"error": "Internal server error"})

    return _resp(200, {"escalation_id": escalation_id, "status": "pending"})
