# SPDX-License-Identifier: MIT
"""
Admin Handler Lambda — Learning Navigator

Serves the admin dashboard API: conversation logs with filtering,
analytics aggregation, sentiment trends, feedback ratios, and
escalation queue management. Access restricted to Internal_Staff role.

Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 8.3, 5.4
"""

import base64
import json
import os
import re
import time
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

# ---------------------------------------------------------------------------
# Module-level clients
# ---------------------------------------------------------------------------
dynamodb = boto3.resource("dynamodb")

# ---------------------------------------------------------------------------
# Environment variables
# ---------------------------------------------------------------------------
CONVERSATIONS_TABLE_NAME = os.environ.get("CONVERSATIONS_TABLE_NAME", "")
FEEDBACK_TABLE_NAME = os.environ.get("FEEDBACK_TABLE_NAME", "")
ESCALATIONS_TABLE_NAME = os.environ.get("ESCALATIONS_TABLE_NAME", "")
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
        "Access-Control-Allow-Methods": "GET,PATCH,OPTIONS",
    }


def _json_serial(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")


def _resp(status_code: int, body: dict) -> dict:
    return {
        "statusCode": status_code,
        "headers": {**_cors_headers(), "Content-Type": "application/json"},
        "body": json.dumps(body, default=_json_serial),
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
# Date / period helpers
# ---------------------------------------------------------------------------
_ISO_DATE_RE = re.compile(
    r"^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$"
)
_VALID_PERIODS = {"7d": 7, "30d": 30, "90d": 90}


def _valid_iso(d: str) -> bool:
    if not _ISO_DATE_RE.match(d):
        return False
    try:
        if "T" in d:
            datetime.fromisoformat(d.replace("Z", "+00:00"))
        else:
            datetime.strptime(d, "%Y-%m-%d")
        return True
    except ValueError:
        return False


def _days(period: str) -> int:
    return _VALID_PERIODS.get(period, 7)


# ---------------------------------------------------------------------------
# Paginated DynamoDB helpers
# ---------------------------------------------------------------------------
def _scan_all(table, **kwargs) -> list:
    items = []
    resp = table.scan(**kwargs)
    items.extend(resp.get("Items", []))
    while "LastEvaluatedKey" in resp:
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]
        resp = table.scan(**kwargs)
        items.extend(resp.get("Items", []))
    return items


def _query_all(table, **kwargs) -> list:
    items = []
    resp = table.query(**kwargs)
    items.extend(resp.get("Items", []))
    while "LastEvaluatedKey" in resp:
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]
        resp = table.query(**kwargs)
        items.extend(resp.get("Items", []))
    return items


# ---------------------------------------------------------------------------
# Route: GET /admin/conversations  (7.2, 7.4)
# ---------------------------------------------------------------------------
def _get_conversations(params: dict) -> dict:
    table = dynamodb.Table(CONVERSATIONS_TABLE_NAME)
    start_date = params.get("start_date", "")
    end_date = params.get("end_date", "")
    role_filter = params.get("role", "")
    lang_filter = params.get("language", "")
    sent_filter = params.get("sentiment", "")

    if start_date and not _valid_iso(start_date):
        return _resp(400, {"error": "Invalid date format. Use ISO 8601"})
    if end_date and not _valid_iso(end_date):
        return _resp(400, {"error": "Invalid date format. Use ISO 8601"})

    try:
        if role_filter:
            kc = Key("user_role").eq(role_filter)
            if start_date and end_date:
                kc = kc & Key("timestamp").between(start_date, end_date)
            elif start_date:
                kc = kc & Key("timestamp").gte(start_date)
            elif end_date:
                kc = kc & Key("timestamp").lte(end_date)
            qk: dict = {"IndexName": "RoleLanguageIndex", "KeyConditionExpression": kc}
            fp, ev, en = [], {}, {}
            if lang_filter:
                fp.append("#lang = :lv"); ev[":lv"] = lang_filter; en["#lang"] = "language"
            if sent_filter:
                try:
                    ev[":sv"] = Decimal(sent_filter); fp.append("sentiment_score >= :sv")
                except Exception:
                    return _resp(400, {"error": "Invalid sentiment score format"})
            if fp:
                qk["FilterExpression"] = " AND ".join(fp)
            if ev:
                qk["ExpressionAttributeValues"] = ev
            if en:
                qk["ExpressionAttributeNames"] = en
            items = _query_all(table, **qk)
        else:
            sk: dict = {}
            fp, ev, en = [], {}, {}
            if start_date:
                fp.append("#ts >= :sd"); ev[":sd"] = start_date; en["#ts"] = "timestamp"
            if end_date:
                en.setdefault("#ts", "timestamp"); fp.append("#ts <= :ed"); ev[":ed"] = end_date
            if lang_filter:
                fp.append("#lang = :lv"); ev[":lv"] = lang_filter; en["#lang"] = "language"
            if sent_filter:
                try:
                    ev[":sv"] = Decimal(sent_filter); fp.append("sentiment_score >= :sv")
                except Exception:
                    return _resp(400, {"error": "Invalid sentiment score format"})
            if fp:
                sk["FilterExpression"] = " AND ".join(fp)
            if ev:
                sk["ExpressionAttributeValues"] = ev
            if en:
                sk["ExpressionAttributeNames"] = en
            items = _scan_all(table, **sk)

        return _resp(200, {"conversations": items, "count": len(items)})
    except Exception as exc:
        _log("conversations", "error", str(exc))
        return _resp(500, {"error": "Internal server error"})


# ---------------------------------------------------------------------------
# Route: GET /admin/conversations/{session_id}
# ---------------------------------------------------------------------------
def _get_session(session_id: str) -> dict:
    table = dynamodb.Table(CONVERSATIONS_TABLE_NAME)
    try:
        items = _query_all(table, KeyConditionExpression=Key("session_id").eq(session_id))
        if not items:
            return _resp(404, {"error": "Session not found"})
        return _resp(200, {"session_id": session_id, "messages": items})
    except Exception as exc:
        _log("session", "error", str(exc))
        return _resp(500, {"error": "Internal server error"})


# ---------------------------------------------------------------------------
# Route: GET /admin/analytics  (7.1)
# ---------------------------------------------------------------------------
def _get_analytics(params: dict) -> dict:
    period = params.get("period", "7d")
    days = _days(period)
    table = dynamodb.Table(CONVERSATIONS_TABLE_NAME)
    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(days=days)).isoformat()

    try:
        items = _scan_all(table,
            FilterExpression="#ts >= :cutoff",
            ExpressionAttributeNames={"#ts": "timestamp"},
            ExpressionAttributeValues={":cutoff": cutoff})

        sessions: dict = {}
        for it in items:
            sid, ts = it.get("session_id", ""), it.get("timestamp", "")
            if not sid or not ts:
                continue
            s = sessions.setdefault(sid, {"first": ts, "last": ts, "count": 0})
            if ts < s["first"]:
                s["first"] = ts
            if ts > s["last"]:
                s["last"] = ts
            s["count"] += 1

        active_cutoff = (now - timedelta(hours=24)).isoformat()
        active = sum(1 for s in sessions.values() if s["last"] >= active_cutoff)

        durations = []
        for s in sessions.values():
            try:
                d = (datetime.fromisoformat(s["last"].replace("Z", "+00:00"))
                     - datetime.fromisoformat(s["first"].replace("Z", "+00:00"))).total_seconds()
                durations.append(d)
            except (ValueError, TypeError):
                continue

        return _resp(200, {
            "period": period,
            "total_conversations": len(sessions),
            "active_sessions": active,
            "average_session_duration_seconds": round(sum(durations) / len(durations), 2) if durations else 0.0,
            "total_messages": len(items),
        })
    except Exception as exc:
        _log("analytics", "error", str(exc))
        return _resp(500, {"error": "Internal server error"})


# ---------------------------------------------------------------------------
# Route: GET /admin/analytics/sentiment  (7.3)
# ---------------------------------------------------------------------------
def _get_sentiment(params: dict) -> dict:
    period = params.get("period", "7d")
    days = _days(period)
    table = dynamodb.Table(CONVERSATIONS_TABLE_NAME)
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    try:
        items = _scan_all(table,
            FilterExpression="#ts >= :cutoff AND #role = :ur AND attribute_exists(sentiment_score)",
            ExpressionAttributeNames={"#ts": "timestamp", "#role": "role"},
            ExpressionAttributeValues={":cutoff": cutoff, ":ur": "user"})

        buckets: dict = {}
        for it in items:
            ts, score = it.get("timestamp", ""), it.get("sentiment_score")
            if not ts or score is None:
                continue
            try:
                dk = ts[:10]
                b = buckets.setdefault(dk, {"total": 0.0, "count": 0})
                b["total"] += float(score); b["count"] += 1
            except (ValueError, TypeError):
                continue

        trend = [{"date": dk, "average_sentiment": round(b["total"] / b["count"], 4),
                  "message_count": b["count"]}
                 for dk, b in sorted(buckets.items()) if b["count"] > 0]

        return _resp(200, {"period": period, "trend": trend})
    except Exception as exc:
        _log("sentiment", "error", str(exc))
        return _resp(500, {"error": "Internal server error"})


# ---------------------------------------------------------------------------
# Route: GET /admin/feedback  (8.3)
# ---------------------------------------------------------------------------
def _get_feedback(params: dict) -> dict:
    period = params.get("period", "7d")
    days = _days(period)
    table = dynamodb.Table(FEEDBACK_TABLE_NAME)
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    try:
        items = _scan_all(table,
            FilterExpression="created_at >= :cutoff",
            ExpressionAttributeValues={":cutoff": cutoff})

        pos = sum(1 for i in items if i.get("rating") == "positive")
        neg = sum(1 for i in items if i.get("rating") == "negative")
        total = pos + neg

        buckets: dict = {}
        for it in items:
            dk = it.get("created_at", "")[:10]
            r = it.get("rating", "")
            if not dk or not r:
                continue
            b = buckets.setdefault(dk, {"positive": 0, "negative": 0})
            if r in ("positive", "negative"):
                b[r] += 1

        trend = []
        for dk in sorted(buckets):
            b = buckets[dk]
            dt = b["positive"] + b["negative"]
            trend.append({"date": dk, "positive": b["positive"], "negative": b["negative"],
                          "ratio": round(b["positive"] / dt, 4) if dt else 0.0})

        return _resp(200, {"period": period, "positive_count": pos, "negative_count": neg,
                           "total_count": total, "ratio": round(pos / total, 4) if total else 0.0,
                           "trend": trend})
    except Exception as exc:
        _log("feedback", "error", str(exc))
        return _resp(500, {"error": "Internal server error"})


# ---------------------------------------------------------------------------
# Route: GET /admin/escalations  (5.4)
# ---------------------------------------------------------------------------
def _get_escalations(params: dict) -> dict:
    status_filter = params.get("status", "pending")
    if status_filter not in ("pending", "resolved"):
        return _resp(400, {"error": "Status must be 'pending' or 'resolved'"})

    table = dynamodb.Table(ESCALATIONS_TABLE_NAME)
    try:
        items = _query_all(table,
            IndexName="StatusIndex",
            KeyConditionExpression=Key("status").eq(status_filter),
            ScanIndexForward=False)
        return _resp(200, {"escalations": items, "count": len(items)})
    except Exception as exc:
        _log("escalations", "error", str(exc))
        return _resp(500, {"error": "Internal server error"})


# ---------------------------------------------------------------------------
# Route: PATCH /admin/escalations/{id}  (5.4)
# ---------------------------------------------------------------------------
def _patch_escalation(escalation_id: str, claims: dict) -> dict:
    table = dynamodb.Table(ESCALATIONS_TABLE_NAME)
    try:
        items = _query_all(table,
            KeyConditionExpression=Key("escalation_id").eq(escalation_id),
            Limit=1)
        if not items:
            return _resp(404, {"error": "Escalation not found"})

        resolved_at = datetime.now(timezone.utc).isoformat()
        table.update_item(
            Key={"escalation_id": escalation_id, "created_at": items[0]["created_at"]},
            UpdateExpression="SET #s = :r, resolved_at = :ra, resolved_by = :rb",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":r": "resolved", ":ra": resolved_at, ":rb": claims.get("sub", "unknown")})

        return _resp(200, {"escalation_id": escalation_id, "status": "resolved", "resolved_at": resolved_at})
    except Exception as exc:
        _log("escalation_patch", "error", str(exc))
        return _resp(500, {"error": "Internal server error"})


# ---------------------------------------------------------------------------
# Lambda Handler — Entry Point
# ---------------------------------------------------------------------------
def lambda_handler(event: dict, context) -> dict:
    """
    Routes API Gateway requests to the appropriate handler.
    Requirement 7.5: access restricted to Internal_Staff role.
    """
    method = event.get("httpMethod", "")
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

    # --- Role-based access control (Requirement 7.5) ---
    role = _extract_role(claims)
    if role != "internal_staff":
        return _resp(403, {"error": "Forbidden"})

    # --- Route to handler ---
    path = event.get("path", "") or event.get("rawPath", "")
    params = event.get("queryStringParameters") or {}
    path_params = event.get("pathParameters") or {}

    try:
        # GET /admin/conversations/{session_id}
        if path.startswith("/admin/conversations/") and method == "GET":
            session_id = path_params.get("session_id", "") or path.split("/")[-1]
            return _get_session(session_id)

        # GET /admin/conversations
        if path == "/admin/conversations" and method == "GET":
            return _get_conversations(params)

        # GET /admin/analytics/sentiment
        if path == "/admin/analytics/sentiment" and method == "GET":
            return _get_sentiment(params)

        # GET /admin/analytics
        if path == "/admin/analytics" and method == "GET":
            return _get_analytics(params)

        # GET /admin/feedback
        if path == "/admin/feedback" and method == "GET":
            return _get_feedback(params)

        # PATCH /admin/escalations/{escalation_id}
        if path.startswith("/admin/escalations/") and method == "PATCH":
            esc_id = path_params.get("id", "") or path.split("/")[-1]
            return _patch_escalation(esc_id, claims)

        # GET /admin/escalations
        if path.startswith("/admin/escalations") and method == "GET":
            return _get_escalations(params)

        return _resp(404, {"error": "Not found"})

    except Exception as exc:
        _log("handler", "error", str(exc))
        return _resp(500, {"error": "Internal server error"})
