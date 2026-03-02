# SPDX-License-Identifier: MIT
"""
Lead Capture Lambda — Learning Navigator

Captures contact information from prospective users. Validates email format,
required fields, stores lead record in DynamoDB, and associates session_id
if provided. This endpoint is unauthenticated (no JWT required).

Requirements: 6.2, 6.3
"""

import json
import os
import re
import uuid
from datetime import datetime, timezone

import boto3

# ---------------------------------------------------------------------------
# Module-level clients — reused across warm invocations
# ---------------------------------------------------------------------------
dynamodb = boto3.resource("dynamodb")

# ---------------------------------------------------------------------------
# Environment variables
# ---------------------------------------------------------------------------
LEADS_TABLE_NAME = os.environ.get("LEADS_TABLE_NAME", "")


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
# Email validation — Requirement 6.2
# ---------------------------------------------------------------------------
_VALID_EMAIL_RE = re.compile(
    r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$"
)


# ---------------------------------------------------------------------------
# Lambda Handler — Entry Point
# ---------------------------------------------------------------------------
def lambda_handler(event: dict, context) -> dict:
    """
    Entry point for the Lead Capture Lambda.
    Unauthenticated endpoint — no JWT required.
    Requirements: 6.2, 6.3
    """
    method = event.get("httpMethod", "") or event.get(
        "requestContext", {}).get("http", {}).get("method", "")
    if method == "OPTIONS":
        return _resp(200, {})

    # --- Parse body ---
    try:
        body = json.loads(event.get("body", "{}") or "{}")
    except (json.JSONDecodeError, TypeError):
        return _resp(400, {"error": "Invalid request body"})

    # --- Validate required fields ---
    name = body.get("name", "").strip()
    if not name:
        return _resp(400, {"error": "Missing required field: name"})

    email = body.get("email", "").strip()
    if not email:
        return _resp(400, {"error": "Missing required field: email"})

    area_of_interest = body.get("area_of_interest", "").strip()
    if not area_of_interest:
        return _resp(400, {"error": "Missing required field: area_of_interest"})

    # --- Validate email format (Requirement 6.2) ---
    if not _VALID_EMAIL_RE.match(email):
        return _resp(400, {"error": "Invalid email format"})

    # --- Optional session association (Requirement 6.3) ---
    session_id = body.get("session_id", "").strip() or None

    # --- Store lead record ---
    if not LEADS_TABLE_NAME:
        _log("handler", "error", "LEADS_TABLE_NAME not configured")
        return _resp(500, {"error": "Internal server error"})

    lead_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()

    item = {
        "lead_id": lead_id,
        "created_at": created_at,
        "name": name,
        "email": email,
        "area_of_interest": area_of_interest,
        "status": "new",
    }
    if session_id:
        item["session_id"] = session_id

    try:
        table = dynamodb.Table(LEADS_TABLE_NAME)
        table.put_item(Item=item)
        _log("handler", "success", f"Lead captured: lead_id={lead_id}")
    except Exception as exc:
        _log("handler", "error", f"DynamoDB write failed: {exc}")
        return _resp(500, {"error": "Internal server error"})

    return _resp(200, {"lead_id": lead_id, "status": "captured"})
