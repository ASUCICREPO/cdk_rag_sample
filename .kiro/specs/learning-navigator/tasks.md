# Implementation Plan: Learning Navigator

## Overview

Backend-first implementation of the Learning Navigator chatbot. We start with CDK infrastructure and core Lambda functions, then build the RAG chat pipeline, add supporting services (leads, feedback, escalation, admin), and finish with the Next.js frontend. Property-based tests validate correctness properties alongside each component.

## Tasks

- [x] 1. Set up CDK infrastructure foundation
  - [x] 1.1 Define DynamoDB tables (Conversations, Leads, Feedback, Escalations) with GSIs, encryption, and PAY_PER_REQUEST billing in `backend/lib/backend-stack.ts`
    - Conversations: PK=session_id, SK=timestamp, GSI RoleLanguageIndex (PK=user_role, SK=timestamp)
    - Leads: PK=lead_id, SK=created_at
    - Feedback: PK=message_id, SK=session_id, GSI SessionFeedbackIndex (PK=session_id, SK=created_at)
    - Escalations: PK=escalation_id, SK=created_at, GSI StatusIndex (PK=status, SK=created_at)
    - _Requirements: 11.3_
  - [x] 1.2 Define S3 documents bucket (knowledge base source) with BPA, enforceSSL, encryption, and versioning
    - Configure S3 event notification for ingestion trigger
    - _Requirements: 11.4, 2.5_
  - [x] 1.3 Define S3 Vectors bucket and vector index using `cdk-s3-vectors` with dimension=1024, cosine distance, and Bedrock metadata keys
    - _Requirements: 11.4_
  - [x] 1.4 Define Bedrock Knowledge Base (CfnKnowledgeBase) with Titan Embed Text V2, S3 Vectors storage config, and S3 data source pointing to documents bucket
    - Configure chunking: HIERARCHICAL strategy
      - Parent chunk: maxTokens=1500 (captures full sections/policies)
      - Child chunk: maxTokens=300 (granular paragraphs/sentences for semantic search)
      - Search is performed on child chunks, parent chunks are returned for comprehensive context
      - Ideal for structured PDFs: policy handbooks, user guides, brand guidelines
    - Create KB IAM role with s3vectors permissions, bedrock:InvokeModel for embedding model, and S3 read
    - Note: Retrieve API may return fewer results than requested since one parent can contain multiple children
    - _Requirements: 2.1, 11.5_
  - [x] 1.5 Define Cognito User Pool with custom role attribute, and User Pool Client
    - Add custom attribute `custom:role` for instructor/internal_staff/learner
    - _Requirements: 9.1_
  - [x] 1.6 Add cdk-nag suppressions for S3 Vectors wildcard permissions and cdk-s3-vectors internal constructs
    - _Requirements: 11.1_

- [x] 2. Implement Chat Handler Lambda
  - [x] 2.1 Create `backend/lambda/chat-handler/index.py` with the core chat flow
    - JWT token validation using Cognito JWKS
    - Role extraction from token claims (with default to learner)
    - Input validation (query, session_id, language)
    - Language validation (accept "en"/"es", default to "en")
    - _Requirements: 1.1, 4.1, 4.4, 3.1, 3.2, 9.2_
  - [x] 2.2 Implement RAG retrieval: call Bedrock KB Retrieve API, extract context and citation sources
    - Handle empty retrieval results with fallback message
    - _Requirements: 2.1, 2.2, 1.4, 2.4_
  - [x] 2.3 Implement role-based system prompt construction
    - Build system prompt with role-specific directives, language instruction, and retrieved context
    - Instructor: course management, invoicing, policy handbook focus
    - Internal_Staff: operational data, analytics, admin guidance focus
    - Learner: general MHFA training guidance focus
    - _Requirements: 4.2, 4.3_
  - [x] 2.4 Implement SSE streaming response using Bedrock ConverseStream with Amazon Nova Pro
    - Stream text-delta events, then citations event, then finish event
    - _Requirements: 1.1, 11.5_
  - [x] 2.5 Implement conversation persistence: store user message and assistant response in DynamoDB Conversations table
    - Include sentiment score placeholder for user messages
    - _Requirements: 1.2_
  - [x] 2.6 Implement PII redaction utility function for log output
    - Redact email addresses and phone number patterns from strings
    - _Requirements: 9.5_
  - [x] 2.7 Define Chat Handler Lambda in CDK with Function URL (streaming), Python runtime, IAM permissions for Bedrock (Retrieve, InvokeModelWithResponseStream), DynamoDB, and environment variables
    - _Requirements: 11.2, 11.7_
  - [ ]* 2.8 Write property test: SSE Response Stream Structure (Property 1)
    - **Property 1: SSE Response Stream Structure**
    - **Validates: Requirements 1.1**
  - [ ]* 2.9 Write property test: Session Conversation Persistence (Property 2)
    - **Property 2: Session Conversation Persistence**
    - **Validates: Requirements 1.2**
  - [ ]* 2.10 Write property test: Citations Present When KB Returns Results (Property 3)
    - **Property 3: Citations Present When KB Returns Results**
    - **Validates: Requirements 2.2**
  - [ ]* 2.11 Write property test: Language Parameter Controls Response Language (Property 5)
    - **Property 5: Language Parameter Controls Response Language**
    - **Validates: Requirements 3.1, 3.2**
  - [ ]* 2.12 Write property test: Language Switch Preserves Conversation Context (Property 6)
    - **Property 6: Language Switch Preserves Conversation Context**
    - **Validates: Requirements 3.4**
  - [ ]* 2.13 Write property test: Role Extraction from JWT (Property 7)
    - **Property 7: Role Extraction from JWT**
    - **Validates: Requirements 4.1**
  - [ ]* 2.14 Write property test: Role-Based System Prompt Construction (Property 8)
    - **Property 8: Role-Based System Prompt Construction**
    - **Validates: Requirements 4.2, 4.3**
  - [ ]* 2.15 Write property test: PII Redaction in Logs (Property 20)
    - **Property 20: PII Redaction in Logs**
    - **Validates: Requirements 9.5**

- [x] 3. Checkpoint - Core chat pipeline
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement Lead Capture Lambda
  - [x] 4.1 Create `backend/lambda/lead-capture/index.py` with email validation, lead record creation, and session association
    - Validate email format, required fields (name, email, area_of_interest)
    - Store lead with generated UUID, created_at, status="new"
    - Associate session_id if provided
    - _Requirements: 6.2, 6.3_
  - [x] 4.2 Define Lead Capture Lambda in CDK with API Gateway integration and DynamoDB permissions
    - _Requirements: 11.2_
  - [ ]* 4.3 Write property test: Email Validation for Leads (Property 11)
    - **Property 11: Email Validation for Leads**
    - **Validates: Requirements 6.2**
  - [ ]* 4.4 Write property test: Lead-Session Association (Property 12)
    - **Property 12: Lead-Session Association**
    - **Validates: Requirements 6.3**

- [x] 5. Implement Feedback Handler Lambda
  - [x] 5.1 Create `backend/lambda/feedback-handler/index.py` with rating validation and storage
    - Validate rating is "positive" or "negative"
    - Store with message_id, session_id, user_role, created_at
    - _Requirements: 8.2_
  - [x] 5.2 Define Feedback Handler Lambda in CDK with API Gateway integration and DynamoDB permissions
    - _Requirements: 11.2_
  - [ ]* 5.3 Write property test: Feedback Storage Completeness (Property 16)
    - **Property 16: Feedback Storage Completeness**
    - **Validates: Requirements 8.2**

- [x] 6. Implement Escalation Handler Lambda
  - [x] 6.1 Create `backend/lambda/escalation-handler/index.py` with escalation record creation
    - Validate required fields (session_id, summary, user_role, contact_email)
    - Store with generated UUID, created_at, status="pending"
    - _Requirements: 5.2_
  - [x] 6.2 Define Escalation Handler Lambda in CDK with API Gateway integration and DynamoDB permissions
    - _Requirements: 11.2_
  - [ ]* 6.3 Write property test: Escalation Record Persistence (Property 9)
    - **Property 9: Escalation Record Persistence**
    - **Validates: Requirements 5.2**

- [x] 7. Implement Admin Handler Lambda
  - [x] 7.1 Create `backend/lambda/admin-handler/index.py` with conversation log retrieval and filtering
    - Support filtering by date range, user_role, language, sentiment score
    - Return full message history with timestamps, user_role, language
    - _Requirements: 7.2, 7.4_
  - [x] 7.2 Implement analytics computation: total conversations, active sessions, average session duration
    - _Requirements: 7.1_
  - [x] 7.3 Implement sentiment aggregation: compute average sentiment per time bucket over configurable period
    - _Requirements: 7.3_
  - [x] 7.4 Implement feedback aggregation: compute positive/negative ratio over time
    - _Requirements: 8.3_
  - [x] 7.5 Implement escalation queue: list pending escalations, mark resolved
    - _Requirements: 5.4_
  - [x] 7.6 Implement role-based access control: verify Internal_Staff role from JWT before processing
    - _Requirements: 7.5_
  - [x] 7.7 Define Admin Handler Lambda in CDK with API Gateway integration (Cognito authorizer), DynamoDB read permissions for all tables
    - _Requirements: 11.2_
  - [ ]* 7.8 Write property test: Escalation Filtering by Status (Property 10)
    - **Property 10: Admin Escalation Filtering by Status**
    - **Validates: Requirements 5.4**
  - [ ]* 7.9 Write property test: Analytics Computation Correctness (Property 13)
    - **Property 13: Analytics Computation Correctness**
    - **Validates: Requirements 7.1**
  - [ ]* 7.10 Write property test: Conversation Log Filtering and Completeness (Property 14)
    - **Property 14: Conversation Log Filtering and Completeness**
    - **Validates: Requirements 7.2, 7.4**
  - [ ]* 7.11 Write property test: Sentiment Aggregation (Property 15)
    - **Property 15: Sentiment Aggregation**
    - **Validates: Requirements 7.3**
  - [ ]* 7.12 Write property test: Feedback Ratio Aggregation (Property 17)
    - **Property 17: Feedback Ratio Aggregation**
    - **Validates: Requirements 8.3**
  - [ ]* 7.13 Write property test: Admin Access Restricted to Internal Staff (Property 19)
    - **Property 19: Admin Access Restricted to Internal Staff**
    - **Validates: Requirements 7.5**

- [x] 8. Implement Ingestion Trigger Lambda
  - [x] 8.1 Create `backend/lambda/ingestion-trigger/index.py` that calls Bedrock StartIngestionJob on S3 PutObject events
    - _Requirements: 2.5_
  - [x] 8.2 Define Ingestion Trigger Lambda in CDK with S3 event source and Bedrock ingestion permissions
    - _Requirements: 11.2_

- [x] 9. Wire API Gateway with Cognito Authorizer
  - [x] 9.1 Define API Gateway REST API in CDK with Cognito User Pool authorizer
    - Routes: POST /leads, POST /feedback, POST /escalations, GET /admin/*,  PATCH /admin/escalations/{id}
    - Apply Cognito authorizer to all routes except POST /leads (unauthenticated)
    - Configure CORS for Amplify URL + localhost
    - _Requirements: 9.1, 9.2_
  - [ ]* 9.2 Write property test: JWT Authentication Enforcement (Property 18)
    - **Property 18: JWT Authentication Enforcement**
    - **Validates: Requirements 9.1, 9.2**

- [x] 10. Checkpoint - Backend complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement frontend chat interface
  - [x] 11.1 Set up frontend project structure: install dependencies (react-i18next, react-markdown, aws-amplify), configure Amplify, create lib/config.ts with environment variables
    - _Requirements: 11.6_
  - [x] 11.2 Create `contexts/LanguageContext.tsx` for language state management with browser language detection
    - _Requirements: 3.1, 3.3_
  - [x] 11.3 Create `hooks/useStreamingChat.ts` custom hook for SSE streaming chat with session management
    - Handle text-delta, citations, finish, and error events
    - Manage loading state, message list, and session ID
    - _Requirements: 1.1, 1.5_
  - [x] 11.4 Create `components/ChatInterface.tsx` with message list, input bar, loading indicator, and welcome message with role-based suggested prompts
    - Keyboard navigable, ARIA labels, ARIA live region for new messages
    - _Requirements: 1.3, 1.5, 10.1, 10.2, 10.4_
  - [x] 11.5 Create `components/MessageBubble.tsx` with markdown rendering, citation display, and feedback buttons (thumbs up/down)
    - _Requirements: 2.3, 8.1_
  - [x] 11.6 Create `components/CitationPanel.tsx` for expandable citation display with document name and section
    - _Requirements: 2.3_
  - [x] 11.7 Create `components/LanguageSelector.tsx` dropdown for English/Spanish switching
    - _Requirements: 3.1, 3.4_
  - [x] 11.8 Create `components/LeadCaptureForm.tsx` modal for unauthenticated users
    - _Requirements: 6.1, 6.4_
  - [x] 11.9 Create `components/EscalationPrompt.tsx` for escalation confirmation flow
    - _Requirements: 5.1, 5.3_
  - [x] 11.10 Set up i18n with react-i18next: create `public/locales/en/common.json` and `public/locales/es/common.json` translation files
    - _Requirements: 3.1, 3.2_
  - [x] 11.11 Create main chat page `app/page.tsx` wiring ChatInterface, LanguageSelector, LeadCaptureForm, and Amplify auth
    - Handle token expiry with re-auth prompt preserving conversation
    - _Requirements: 9.6_
  - [ ]* 11.12 Write property test: Citation Rendering Includes Required Fields (Property 4)
    - **Property 4: Citation Rendering Includes Required Fields**
    - **Validates: Requirements 2.3**
  - [ ]* 11.13 Write unit tests for edge cases: empty KB results fallback, missing role default, token expiry re-auth, browser language detection
    - _Requirements: 1.4, 4.4, 9.6, 3.3_

- [x] 12. Implement admin dashboard frontend
  - [x] 12.1 Create `app/admin/page.tsx` with AdminDashboard layout, auth guard for Internal_Staff role
    - _Requirements: 7.5_
  - [x] 12.2 Create `components/ConversationLog.tsx` with filterable conversation list (date range, role, language, sentiment)
    - _Requirements: 7.2, 7.4_
  - [x] 12.3 Create `components/AnalyticsPanel.tsx` with usage metrics and sentiment trend charts
    - _Requirements: 7.1, 7.3_
  - [x] 12.4 Create `components/EscalationQueue.tsx` for viewing and resolving pending escalations
    - _Requirements: 5.4_
  - [x] 12.5 Create `components/FeedbackAnalytics.tsx` for feedback ratio display
    - _Requirements: 8.3_

- [x] 13. Deploy frontend with Amplify
  - [x] 13.1 Define Amplify App in CDK with GitHub source, build spec for Next.js, SPA rewrite rule, and environment variables (API URL, Function URL, Cognito config)
    - Construct amplifyAppUrl and pass to CORS origins on Function URL and API Gateway
    - _Requirements: 11.6_

- [x] 14. Upload knowledge base documents and trigger initial ingestion
  - [x] 14.1 Create a CDK custom resource or deployment script to upload the 4 PDFs from the local `knowledge_base_docs/` directory (located at `/Users/etloaner/Desktop/CIC/Repository-Template/knowledge_base_docs/`) to the S3 documents bucket and trigger initial KB ingestion
    - Source files: `25.04.11_MHFA_Learners-ConnectUserGuide_RW.pdf`, `25.04.14_MHFA Connect User Guide_RW.pdf`, `MHFA_InstructorPolicyHandbook_8.6.25.pdf`, `National Council Brand Guidelines_2025_FINAL 25.09.09 1.pdf`
    - Use `s3deploy.BucketDeployment` to upload from the local path to the S3 documents bucket
    - _Requirements: 2.1, 2.5_

- [x] 15. Final checkpoint - Full system integration
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using Hypothesis (Python) and fast-check (TypeScript)
- Unit tests validate specific examples and edge cases
- Backend is implemented first per CIC architectural standards
- All CDK resources follow security standards: encryption at rest, enforceSSL, IAM least privilege, cdk-nag compliance
