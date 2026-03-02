# SPDX-License-Identifier: MIT
"""
Ingestion Trigger Lambda — Learning Navigator

Triggered by S3 PutObject events on the documents bucket.
Starts a Bedrock Knowledge Base ingestion job to re-index
newly added or updated documents.

Requirements: 2.5
"""

import json
import os
from datetime import datetime, timezone

import boto3

# ---------------------------------------------------------------------------
# Module-level clients — reused across warm invocations
# ---------------------------------------------------------------------------
bedrock_agent = boto3.client("bedrock-agent")

# ---------------------------------------------------------------------------
# Environment variables
# ---------------------------------------------------------------------------
KNOWLEDGE_BASE_ID = os.environ.get("KNOWLEDGE_BASE_ID", "")
DATA_SOURCE_ID = os.environ.get("DATA_SOURCE_ID", "")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _log(step: str, status: str, message: str) -> None:
    print(json.dumps({"timestamp": datetime.now(timezone.utc).isoformat(),
                       "step": step, "status": status, "message": message}))


# ---------------------------------------------------------------------------
# Lambda Handler — Entry Point
# ---------------------------------------------------------------------------
def lambda_handler(event: dict, context) -> dict:
    """
    Triggered by S3 PutObject events on the documents bucket.
    Starts a Bedrock KB ingestion job to re-index documents.
    Requirements: 2.5
    """
    _log("handler", "start", "Ingestion trigger invoked")

    if not KNOWLEDGE_BASE_ID or not DATA_SOURCE_ID:
        _log("handler", "error", "KNOWLEDGE_BASE_ID or DATA_SOURCE_ID not configured")
        return {"statusCode": 500, "body": "Missing configuration"}

    # Log which files triggered the event
    records = event.get("Records", [])
    for record in records:
        key = record.get("s3", {}).get("object", {}).get("key", "unknown")
        _log("handler", "info", f"S3 event for key: {key}")

    try:
        response = bedrock_agent.start_ingestion_job(
            knowledgeBaseId=KNOWLEDGE_BASE_ID,
            dataSourceId=DATA_SOURCE_ID,
        )
        ingestion_job = response.get("ingestionJob", {})
        job_id = ingestion_job.get("ingestionJobId", "unknown")
        _log("handler", "success", f"Ingestion job started: {job_id}")

        return {
            "statusCode": 200,
            "body": json.dumps({
                "ingestion_job_id": job_id,
                "status": ingestion_job.get("status", "unknown"),
            }),
        }
    except Exception as exc:
        _log("handler", "error", f"StartIngestionJob failed: {exc}")
        return {"statusCode": 500, "body": "Ingestion job failed"}
