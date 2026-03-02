# Requirements Document

## Introduction

The Learning Navigator is an AI-powered chatbot assistant integrated into the National Council for Mental Wellbeing's Learning Ecosystem. The chatbot supports Mental Health First Aid (MHFA) instructors, internal staff, and potentially learners by providing real-time guidance, answering FAQs, navigating training resources, and reducing administrative burden. The system uses Retrieval-Augmented Generation (RAG) backed by a Bedrock Knowledge Base with S3 Vectors to ground responses in authoritative MHFA documentation. The chatbot supports English and Spanish, enforces role-based personalization behind authentication, and provides an admin dashboard for analytics and conversation oversight.

## Glossary

- **Learning_Navigator**: The AI-powered chatbot application that serves as the primary user-facing assistant.
- **Chat_Interface**: The frontend component where users compose messages and receive streamed AI responses.
- **RAG_Pipeline**: The Retrieval-Augmented Generation pipeline that retrieves relevant document chunks from the Knowledge Base and augments the LLM prompt with grounded context.
- **Knowledge_Base**: The Bedrock Knowledge Base backed by S3 Vectors containing indexed MHFA documentation (instructor handbook, learner guides, connect user guides).
- **Citation_Engine**: The component responsible for extracting source references from RAG retrieval results and attaching them to chatbot responses.
- **Escalation_Service**: The component that detects when a conversation requires human intervention and creates a Zendesk support ticket with conversation context.
- **Lead_Capture_Service**: The component that collects contact information from unauthenticated or new users for follow-up by the National Council team.
- **Admin_Dashboard**: The administrative interface providing conversation logs, analytics, and sentiment analysis for internal staff.
- **Sentiment_Analyzer**: The component that evaluates the emotional tone of user messages to surface trends and flag conversations needing attention.
- **Language_Service**: The component responsible for detecting user language preference and serving responses in English or Spanish.
- **Session_Manager**: The component that maintains conversation state across multiple user messages within a single chat session.
- **Feedback_Service**: The component that captures user ratings (thumbs up/thumbs down) on individual chatbot responses.
- **Instructor**: A certified MHFA instructor who uses the Learning Ecosystem to manage courses and access training resources.
- **Internal_Staff**: National Council employees who support training operations and use the Admin Dashboard.
- **Learner**: An individual enrolled in or completing MHFA training programs.

## Requirements

### Requirement 1: Conversational Chat Interface

**User Story:** As an Instructor, I want to interact with an AI chatbot through a conversational interface, so that I can get answers to my questions about MHFA training, course management, and policies without searching through documents manually.

#### Acceptance Criteria

1. WHEN a user sends a message through the Chat_Interface, THE Learning_Navigator SHALL stream the AI response incrementally using Server-Sent Events so the user sees text appearing in real time.
2. WHEN a conversation is in progress, THE Session_Manager SHALL maintain conversation context across multiple messages within the same session.
3. WHEN the Chat_Interface loads, THE Learning_Navigator SHALL display a welcome message with suggested prompts tailored to the authenticated user's role.
4. IF the RAG_Pipeline fails to retrieve relevant context, THEN THE Learning_Navigator SHALL inform the user that no relevant information was found and suggest rephrasing the question.
5. WHEN a user sends a message, THE Chat_Interface SHALL display a loading indicator until the first response chunk arrives.

### Requirement 2: RAG-Powered Knowledge Retrieval with Citations

**User Story:** As an Instructor, I want the chatbot to answer my questions using official MHFA documentation and show me where the information came from, so that I can trust the accuracy of the responses and reference the source material.

#### Acceptance Criteria

1. WHEN a user sends a query, THE RAG_Pipeline SHALL retrieve relevant document chunks from the Knowledge_Base and provide them as context to the LLM.
2. THE Citation_Engine SHALL attach source document references to every AI response that uses retrieved content.
3. WHEN displaying citations, THE Chat_Interface SHALL render each citation with the document name and relevant section identifier.
4. WHEN the Knowledge_Base contains no relevant results for a query, THE RAG_Pipeline SHALL return an empty context and THE Learning_Navigator SHALL generate a response indicating the information is not available in the current documentation.
5. WHEN documents are added or updated in the Knowledge_Base source bucket, THE RAG_Pipeline SHALL support re-ingestion to keep the vector index current.

### Requirement 3: English and Spanish Language Support

**User Story:** As a Learner, I want to interact with the chatbot in English or Spanish, so that I can receive guidance in my preferred language.

#### Acceptance Criteria

1. WHEN a user selects a language preference, THE Language_Service SHALL serve all subsequent responses in the selected language.
2. THE Language_Service SHALL support English and Spanish as available language options.
3. WHEN the Chat_Interface loads, THE Learning_Navigator SHALL detect the user's browser language and pre-select the matching supported language.
4. WHEN a user switches language mid-conversation, THE Language_Service SHALL apply the new language to all subsequent responses without losing conversation context.

### Requirement 4: Role-Based Personalization

**User Story:** As an Instructor, I want the chatbot to understand my role and tailor its responses accordingly, so that I receive relevant information for my specific needs rather than generic answers.

#### Acceptance Criteria

1. WHEN an authenticated user starts a conversation, THE Learning_Navigator SHALL retrieve the user's role (Instructor, Internal_Staff, or Learner) from the authentication context.
2. WHILE a user is authenticated as an Instructor, THE Learning_Navigator SHALL prioritize instructor-specific content such as course management, invoicing guidance, and the Instructor Policy Handbook.
3. WHILE a user is authenticated as Internal_Staff, THE Learning_Navigator SHALL provide access to operational data, analytics summaries, and administrative guidance.
4. IF a user's role cannot be determined from the authentication context, THEN THE Learning_Navigator SHALL default to general MHFA learner guidance.

### Requirement 5: AI-Driven Escalation to Live Support

**User Story:** As an Instructor, I want the chatbot to recognize when it cannot resolve my issue and offer to connect me with human support, so that I do not get stuck without help.

#### Acceptance Criteria

1. WHEN the Learning_Navigator detects that a user's issue cannot be resolved through available documentation, THE Escalation_Service SHALL offer the user the option to escalate to live support.
2. WHEN a user confirms escalation, THE Escalation_Service SHALL record the escalation request containing the conversation summary, user role, and contact information in the database.
3. WHEN an escalation request is recorded, THE Chat_Interface SHALL display a confirmation message informing the user that a support team member will follow up.
4. WHEN viewing the Admin_Dashboard, THE Admin_Dashboard SHALL display pending escalation requests so Internal_Staff can follow up manually.

### Requirement 6: Lead Capture

**User Story:** As Internal_Staff, I want the chatbot to capture contact information from prospective users, so that the team can follow up with potential instructors and training partners.

#### Acceptance Criteria

1. WHEN an unauthenticated user interacts with the Learning_Navigator, THE Lead_Capture_Service SHALL prompt the user to provide their name, email, and area of interest.
2. WHEN a user submits lead information, THE Lead_Capture_Service SHALL validate the email format and store the lead record in the database.
3. WHEN a lead record is stored, THE Lead_Capture_Service SHALL associate the conversation session with the lead record for context.
4. IF a user declines to provide contact information, THEN THE Learning_Navigator SHALL continue the conversation without restricting functionality.

### Requirement 7: Admin Dashboard with Analytics

**User Story:** As Internal_Staff, I want to view conversation logs, usage analytics, and sentiment trends, so that I can monitor chatbot performance and identify areas for improvement.

#### Acceptance Criteria

1. WHEN an Internal_Staff user accesses the Admin_Dashboard, THE Admin_Dashboard SHALL display a summary of total conversations, active sessions, and average session duration.
2. WHEN viewing conversation logs, THE Admin_Dashboard SHALL display the full message history for each session with timestamps, user role, and language used.
3. WHEN viewing analytics, THE Sentiment_Analyzer SHALL display aggregated sentiment trends across conversations over a configurable time period.
4. WHEN an Internal_Staff user searches conversation logs, THE Admin_Dashboard SHALL support filtering by date range, user role, language, and sentiment score.
5. THE Admin_Dashboard SHALL restrict access to authenticated users with the Internal_Staff role.

### Requirement 8: User Feedback on Responses

**User Story:** As an Instructor, I want to rate chatbot responses as helpful or unhelpful, so that the team can identify which responses need improvement.

#### Acceptance Criteria

1. WHEN a chatbot response is displayed, THE Chat_Interface SHALL render thumbs up and thumbs down feedback buttons alongside the response.
2. WHEN a user submits feedback, THE Feedback_Service SHALL store the rating associated with the specific message, session, and user role.
3. WHEN viewing analytics, THE Admin_Dashboard SHALL display feedback aggregation showing the ratio of positive to negative ratings over time.

### Requirement 9: Secure Authentication and Data Privacy

**User Story:** As an Instructor, I want my interactions with the chatbot to be secure and private, so that my personal information and conversation data are protected.

#### Acceptance Criteria

1. THE Learning_Navigator SHALL require authentication via Amazon Cognito before granting access to role-specific features.
2. WHEN a user authenticates, THE Learning_Navigator SHALL validate the JWT token on every API request.
3. THE Learning_Navigator SHALL encrypt all data at rest using AWS-managed encryption keys for DynamoDB tables and S3 buckets.
4. THE Learning_Navigator SHALL enforce HTTPS for all communication between the Chat_Interface and backend services.
5. THE Learning_Navigator SHALL redact personally identifiable information from CloudWatch log output.
6. IF an authentication token expires during a session, THEN THE Learning_Navigator SHALL prompt the user to re-authenticate without losing the current conversation history.

### Requirement 10: Accessibility Compliance

**User Story:** As a Learner with accessibility needs, I want the chatbot interface to be accessible, so that I can use it effectively with assistive technologies.

#### Acceptance Criteria

1. THE Chat_Interface SHALL support keyboard navigation for all interactive elements including message input, send button, feedback buttons, and language selector.
2. THE Chat_Interface SHALL provide ARIA labels and roles for all interactive components so screen readers can interpret the interface.
3. THE Chat_Interface SHALL maintain a minimum color contrast ratio of 4.5:1 for normal text and 3:1 for large text as measured against the background.
4. WHEN a new chatbot response arrives, THE Chat_Interface SHALL announce the new message to screen readers using an ARIA live region.
5. THE Chat_Interface SHALL support text resizing up to 200% without loss of content or functionality.

### Requirement 11: Serverless Infrastructure and Deployment

**User Story:** As a developer, I want the application deployed using serverless AWS infrastructure defined in CDK, so that the system scales automatically and minimizes operational overhead.

#### Acceptance Criteria

1. THE Learning_Navigator SHALL deploy all backend resources using a single AWS CDK stack written in TypeScript.
2. THE Learning_Navigator SHALL use AWS Lambda with Python runtime for all backend compute functions.
3. THE Learning_Navigator SHALL use DynamoDB for storing conversation history, lead records, feedback, and session data.
4. THE Learning_Navigator SHALL use S3 with S3 Vectors for the RAG knowledge base vector store.
5. THE Learning_Navigator SHALL use Amazon Bedrock for LLM inference and embedding generation.
6. THE Learning_Navigator SHALL deploy the frontend as a Next.js application hosted on AWS Amplify.
7. THE Learning_Navigator SHALL use Lambda Function URLs with streaming support for the chat API endpoint.
