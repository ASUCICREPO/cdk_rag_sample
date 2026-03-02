# Learning Navigator APIs

This document provides comprehensive API documentation for the Learning Navigator chatbot.

---

## Overview

The Learning Navigator exposes two API surfaces:

1. **Chat API** — Lambda Function URL with SSE streaming for real-time chat
2. **REST API** — API Gateway endpoints for leads, feedback, escalations, and admin dashboard

---

## Base URLs

### Chat API (Lambda Function URL)

```
https://<function-url-id>.lambda-url.<region>.on.aws/
```

> After deployment, find this value in the CDK stack output `ChatHandlerFunctionUrl` or the `NEXT_PUBLIC_CHAT_FUNCTION_URL` environment variable.

### REST API (API Gateway)

```
https://<api-id>.execute-api.<region>.amazonaws.com/prod/
```

> After deployment, find this value in the CDK stack output or the `NEXT_PUBLIC_API_URL` environment variable.

---

## Authentication

Most endpoints require a Cognito JWT token passed as a Bearer token in the `Authorization` header.

| Header | Description | Required |
|--------|-------------|----------|
| `Authorization` | `Bearer <cognito-id-token>` | Yes (except POST /leads) |
| `Content-Type` | `application/json` | Yes |
| `Accept` | `text/event-stream` (chat only) | Chat endpoint only |

The ID token (not access token) must be used. It carries the `custom:role` claim needed for role-based personalization.

---

## 1) Chat Endpoint

Real-time streaming chat powered by RAG retrieval and Amazon Nova Pro.

---

#### POST / — Send a chat message (SSE streaming)

- **URL**: Chat Lambda Function URL (not API Gateway)
- **Auth**: Bearer token (Cognito ID token)
- **Purpose**: Send a user query and receive a streaming AI response with citations

- **Request body**:
```json
{
  "query": "string — the user's question (required)",
  "session_id": "string — session identifier, min 33 chars (required)",
  "language": "string — 'en' or 'es' (optional, defaults to 'en')"
}
```

- **Example request**:
```json
{
  "query": "How do I manage my upcoming MHFA courses?",
  "session_id": "session_m1abc123_def456ghi789jkl",
  "language": "en"
}
```

- **Response**: Server-Sent Events stream with the following event types:

```
event: text-delta
data: {"type": "text-delta", "content": "Here are the steps..."}

event: text-delta
data: {"type": "text-delta", "content": " to manage your courses:"}

event: citations
data: {"type": "citations", "sources": [{"document": "MHFA_InstructorPolicyHandbook.pdf", "section": "s3://bucket/key"}]}

event: finish
data: {"type": "finish", "message_id": "uuid-string"}
```

- **SSE Event Types**:

| Event | Description |
|-------|-------------|
| `text-delta` | Incremental text chunk of the AI response |
| `citations` | Source document references from KB retrieval |
| `finish` | Stream complete, includes `message_id` |
| `error` | Error occurred during processing |

- **Status codes**:
  - `200 OK` — streaming response initiated
  - `400 Bad Request` — missing or invalid fields
  - `401 Unauthorized` — missing or invalid JWT token

---

## 2) Lead Capture Endpoint

Captures contact information from prospective users. No authentication required.

---

#### POST /leads — Submit lead information

- **Auth**: None (unauthenticated)
- **Purpose**: Capture name, email, and area of interest from prospective users

- **Request body**:
```json
{
  "name": "string — contact name (required)",
  "email": "string — valid email address (required)",
  "area_of_interest": "string — area of interest (required)",
  "session_id": "string — associate with chat session (optional)"
}
```

- **Example request**:
```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "area_of_interest": "Instructor Certification",
  "session_id": "session_m1abc123_def456ghi789jkl"
}
```

- **Success response** (`200`):
```json
{
  "lead_id": "uuid-string",
  "status": "captured"
}
```

- **Error responses**:
  - `400` — `{"error": "Missing required field: name"}` / `"Invalid email format"`
  - `500` — `{"error": "Internal server error"}`

---

## 3) Feedback Endpoint

Records thumbs up/down ratings on chatbot responses.

---

#### POST /feedback — Submit response feedback

- **Auth**: Bearer token (Cognito ID token)
- **Purpose**: Rate a specific chatbot response as positive or negative

- **Request body**:
```json
{
  "message_id": "string — ID of the rated message (required)",
  "session_id": "string — session identifier (required)",
  "rating": "string — 'positive' or 'negative' (required)"
}
```

- **Example request**:
```json
{
  "message_id": "msg_1234567890_abc",
  "session_id": "session_m1abc123_def456ghi789jkl",
  "rating": "positive"
}
```

- **Success response** (`200`):
```json
{
  "status": "recorded"
}
```

- **Error responses**:
  - `400` — `{"error": "Rating must be 'positive' or 'negative'"}`
  - `401` — `{"error": "Authentication required"}`
  - `500` — `{"error": "Internal server error"}`

---

## 4) Escalation Endpoint

Creates escalation requests for human follow-up.

---

#### POST /escalations — Create escalation request

- **Auth**: Bearer token (Cognito ID token)
- **Purpose**: Escalate a conversation to human support

- **Request body**:
```json
{
  "session_id": "string — session identifier (required)",
  "summary": "string — conversation summary (required)",
  "contact_email": "string — valid email for follow-up (required)"
}
```

- **Example request**:
```json
{
  "session_id": "session_m1abc123_def456ghi789jkl",
  "summary": "User needs help with course scheduling conflict",
  "contact_email": "jane@example.com"
}
```

- **Success response** (`200`):
```json
{
  "escalation_id": "uuid-string",
  "status": "pending"
}
```

- **Error responses**:
  - `400` — `{"error": "Missing required field: session_id"}` / `"Invalid email format"`
  - `401` — `{"error": "Authentication required"}`
  - `500` — `{"error": "Internal server error"}`

---

## 5) Admin Endpoints

All admin endpoints require authentication and `internal_staff` role. Non-staff users receive `403 Forbidden`.

---

#### GET /admin/conversations — List conversation sessions

- **Purpose**: Retrieve conversation sessions with optional filtering

- **Query parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `start_date` | string (ISO 8601) | No | Filter sessions from this date |
| `end_date` | string (ISO 8601) | No | Filter sessions until this date |
| `role` | string | No | Filter by user role (`instructor`, `internal_staff`, `learner`) |
| `language` | string | No | Filter by language (`en`, `es`) |
| `sentiment` | string (decimal) | No | Filter by minimum sentiment score |

- **Example request**:
```
GET /admin/conversations?role=instructor&start_date=2025-01-01&language=en
```

- **Success response** (`200`):
```json
{
  "conversations": [
    {
      "session_id": "session_abc123...",
      "user_role": "instructor",
      "language": "en",
      "timestamp": "2025-01-15T10:30:00Z",
      "content": "How do I manage courses?",
      "role": "user"
    }
  ],
  "count": 42
}
```

---

#### GET /admin/conversations/{session_id} — Get full session messages

- **Purpose**: Retrieve all messages for a specific conversation session

- **Success response** (`200`):
```json
{
  "session_id": "session_abc123...",
  "messages": [
    {
      "session_id": "session_abc123...",
      "timestamp": "2025-01-15T10:30:00Z",
      "role": "user",
      "content": "How do I manage courses?",
      "user_role": "instructor",
      "language": "en"
    },
    {
      "session_id": "session_abc123...",
      "timestamp": "2025-01-15T10:30:05Z",
      "role": "assistant",
      "content": "Here are the steps to manage your courses..."
    }
  ]
}
```

- **Error responses**:
  - `404` — `{"error": "Session not found"}`

---

#### GET /admin/analytics — Usage metrics

- **Purpose**: Retrieve aggregated usage metrics for a time period

- **Query parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `period` | string | No | `7d`, `30d`, or `90d` (default: `7d`) |

- **Success response** (`200`):
```json
{
  "period": "7d",
  "total_conversations": 150,
  "active_sessions": 12,
  "average_session_duration_seconds": 245.5,
  "total_messages": 890
}
```

---

#### GET /admin/analytics/sentiment — Sentiment trends

- **Purpose**: Retrieve aggregated sentiment trends over time

- **Query parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `period` | string | No | `7d`, `30d`, or `90d` (default: `7d`) |

- **Success response** (`200`):
```json
{
  "period": "7d",
  "trend": [
    {
      "date": "2025-01-15",
      "average_sentiment": 0.72,
      "message_count": 45
    }
  ]
}
```

---

#### GET /admin/feedback — Feedback aggregation

- **Purpose**: Retrieve positive/negative feedback ratios over time

- **Query parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `period` | string | No | `7d`, `30d`, or `90d` (default: `7d`) |

- **Success response** (`200`):
```json
{
  "period": "7d",
  "positive_count": 120,
  "negative_count": 15,
  "total_count": 135,
  "ratio": 0.8889,
  "trend": [
    {
      "date": "2025-01-15",
      "positive": 18,
      "negative": 2,
      "ratio": 0.9
    }
  ]
}
```

---

#### GET /admin/escalations — List escalations

- **Purpose**: Retrieve escalation requests filtered by status

- **Query parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | string | No | `pending` or `resolved` (default: `pending`) |

- **Success response** (`200`):
```json
{
  "escalations": [
    {
      "escalation_id": "uuid-string",
      "session_id": "session_abc123...",
      "summary": "User needs help with scheduling",
      "user_role": "instructor",
      "contact_email": "jane@example.com",
      "status": "pending",
      "created_at": "2025-01-15T10:30:00Z"
    }
  ],
  "count": 5
}
```

---

#### PATCH /admin/escalations/{id} — Resolve escalation

- **Purpose**: Mark an escalation as resolved

- **Success response** (`200`):
```json
{
  "escalation_id": "uuid-string",
  "status": "resolved",
  "resolved_at": "2025-01-15T14:00:00Z"
}
```

- **Error responses**:
  - `404` — `{"error": "Escalation not found"}`

---

## Error Codes

| Code | Name | Description |
|------|------|-------------|
| `400` | Bad Request | Missing required fields, invalid format, or validation failure |
| `401` | Unauthorized | Missing or invalid JWT token |
| `403` | Forbidden | Authenticated but insufficient role (admin endpoints require `internal_staff`) |
| `404` | Not Found | Requested resource does not exist |
| `500` | Internal Server Error | Unexpected server-side failure |

---

## Rate Limiting

API Gateway throttling is configured at the stage level:

- **Rate limit**: 100 requests per second
- **Burst limit**: 50 requests

The Chat Function URL does not have API Gateway throttling but is subject to Lambda concurrency limits.

---

## SDK / Client Examples

### JavaScript/TypeScript (Chat with SSE)
```typescript
const response = await fetch(CHAT_FUNCTION_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
    'Authorization': `Bearer ${idToken}`
  },
  body: JSON.stringify({
    query: 'What is MHFA training?',
    session_id: 'session_abc123...',
    language: 'en'
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  // Parse SSE events from buffer
}
```

### JavaScript/TypeScript (REST API)
```typescript
const response = await fetch(`${API_URL}/leads`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Jane Doe',
    email: 'jane@example.com',
    area_of_interest: 'Instructor Certification'
  })
});

const data = await response.json();
```

### cURL
```bash
# Lead capture (unauthenticated)
curl -X POST 'https://<api-id>.execute-api.us-east-1.amazonaws.com/prod/leads' \
  -H 'Content-Type: application/json' \
  -d '{"name": "Jane Doe", "email": "jane@example.com", "area_of_interest": "Training"}'

# Admin analytics (authenticated)
curl -X GET 'https://<api-id>.execute-api.us-east-1.amazonaws.com/prod/admin/analytics?period=7d' \
  -H 'Authorization: Bearer <cognito-id-token>'
```
