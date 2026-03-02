# Learning Navigator

An AI-powered chatbot assistant for the National Council for Mental Wellbeing's Mental Health First Aid (MHFA) program. The Learning Navigator provides real-time guidance to MHFA instructors, internal staff, and learners by answering questions about training resources, policies, and procedures using Retrieval-Augmented Generation (RAG) backed by Amazon Bedrock. The system supports English and Spanish, features role-based personalization, and includes an admin dashboard for analytics and conversation oversight.

---

## Disclaimers

Customers are responsible for making their own independent assessment of the information in this document. This document:

(a) is for informational purposes only,

(b) references AWS product offerings and practices, which are subject to change without notice,

(c) does not create any commitments or assurances from AWS and its affiliates, suppliers or licensors. AWS products or services are provided "as is" without warranties, representations, or conditions of any kind, whether express or implied. The responsibilities and liabilities of AWS to its customers are controlled by AWS agreements, and this document is not part of, nor does it modify, any agreement between AWS and its customers, and

(d) is not to be considered a recommendation or viewpoint of AWS.

Additionally, you are solely responsible for testing, security and optimizing all code and assets on GitHub repo, and all such code and assets should be considered:

(a) as-is and without warranties or representations of any kind,

(b) not suitable for production environments, or on production or other critical data, and

(c) to include shortcuts in order to support rapid prototyping such as, but not limited to, relaxed authentication and authorization and a lack of strict adherence to security best practices.

All work produced is open source. More information can be found in the GitHub repo.

---

## Visual Demo

![User Interface Demo](./docs/media/user-interface.gif)

> **[PLACEHOLDER]** Please provide a GIF or screenshot of the application interface and save it as `docs/media/user-interface.gif`

---

## Table of Contents

| Index                                               | Description                                              |
| :-------------------------------------------------- | :------------------------------------------------------- |
| [High Level Architecture](#high-level-architecture) | High level overview illustrating component interactions  |
| [Deployment Guide](#deployment-guide)               | How to deploy the project                                |
| [User Guide](#user-guide)                           | End-user instructions and walkthrough                    |
| [API Documentation](#api-documentation)             | Documentation on the APIs the project uses               |
| [Directories](#directories)                         | General project directory structure                      |
| [Modification Guide](#modification-guide)           | Guide for developers extending the project               |
| [Removing Commit History](#removing-commit-history) | Steps to clean commit history when using as a template   |
| [Credits](#credits)                                 | Contributors and acknowledgments                         |
| [License](#license)                                 | License information                                      |

---

## High Level Architecture

The Learning Navigator is built on a serverless AWS architecture with a Next.js frontend hosted on Amplify and a Python/TypeScript backend deployed via AWS CDK. The system uses Amazon Bedrock Knowledge Base with S3 Vectors for RAG-powered responses, Amazon Nova Pro for chat generation, and Cognito for authentication. All conversation data, feedback, leads, and escalations are stored in DynamoDB tables. The chat interface uses Server-Sent Events (SSE) streaming via Lambda Function URLs for real-time responses.

Key components:
- **Frontend**: Next.js with TypeScript, AWS Amplify hosting, react-i18next for bilingual support
- **Backend**: AWS Lambda (Python 3.13), API Gateway, DynamoDB, S3, Bedrock Knowledge Base
- **AI/ML**: Amazon Nova Pro (chat), Titan Embed Text V2 (embeddings), S3 Vectors (vector store)
- **Auth**: Amazon Cognito with custom role attribute (instructor/internal_staff/learner)
- **Infrastructure**: AWS CDK (TypeScript) for Infrastructure as Code

![Architecture Diagram](./architecture_diagram/learning-navigator-architecture.png)

For a detailed explanation of the architecture and architectural decisions, see the [Architecture Deep Dive](./docs/architectureDeepDive.md).

---

## Deployment Guide

For complete deployment instructions, see the [Deployment Guide](./docs/deploymentGuide.md).

**Quick Start:**
1. **Prerequisites**: Install Node.js 18+, Python 3.13+, AWS CLI, AWS CDK CLI, and configure AWS credentials
2. **Backend**: `cd backend && npm install && cdk deploy` (optionally pass `-c githubOwner=... -c githubRepo=... -c githubTokenSecretName=...` for Amplify)
3. **Frontend**: Set environment variables in `.env.local` from CDK outputs, then `cd frontend && npm install && npm run dev` for local testing
4. **Knowledge Base**: Upload PDF documents to the S3 documents bucket to populate the knowledge base
5. **Users**: Create Cognito users via AWS CLI or console and set the `custom:role` attribute to `instructor`, `internal_staff`, or `learner`

---

## User Guide

For detailed usage instructions with screenshots, see the [User Guide](./docs/userGuide.md).

---

## API Documentation

For complete API reference, see the [API Documentation](./docs/APIDoc.md).

---

## Modification Guide

For developers looking to extend or modify this project, see the [Modification Guide](./docs/modificationGuide.md).

---

## Directories

```
learning-navigator/
├── backend/
│   ├── bin/
│   │   └── backend.ts                  # CDK app entry point
│   ├── lambda/
│   │   ├── chat-handler/               # SSE streaming chat with Bedrock
│   │   ├── lead-capture/               # Unauthenticated lead collection
│   │   ├── feedback-handler/           # Thumbs up/down ratings
│   │   ├── escalation-handler/         # Human support escalation
│   │   ├── admin-handler/              # Dashboard analytics
│   │   └── ingestion-trigger/          # S3 event-driven KB re-indexing
│   ├── lib/
│   │   └── backend-stack.ts            # Infrastructure definitions (~1260 lines)
│   ├── cdk.json                        # CDK configuration
│   ├── package.json                    # TypeScript dependencies
│   └── tsconfig.json
├── frontend/
│   ├── app/
│   │   ├── layout.tsx                  # Root layout with i18n
│   │   ├── page.tsx                    # Main chat page
│   │   ├── admin/page.tsx              # Admin dashboard
│   │   └── globals.css                 # Global styles
│   ├── components/
│   │   ├── AppShell.tsx                # Auth wrapper, header
│   │   ├── ChatInterface.tsx           # Main chat UI
│   │   ├── MessageBubble.tsx           # Message display
│   │   ├── CitationPanel.tsx           # Source references
│   │   ├── LeadCaptureForm.tsx         # Contact form modal
│   │   ├── EscalationPrompt.tsx        # Escalation dialog
│   │   ├── LanguageSelector.tsx        # EN/ES switcher
│   │   ├── ConversationLog.tsx         # Admin: message history
│   │   ├── AnalyticsPanel.tsx          # Admin: usage stats
│   │   ├── FeedbackAnalytics.tsx       # Admin: rating trends
│   │   └── EscalationQueue.tsx         # Admin: pending escalations
│   ├── hooks/
│   │   └── useStreamingChat.ts         # SSE streaming logic
│   ├── contexts/
│   │   └── LanguageContext.tsx         # i18n state management
│   ├── lib/
│   │   ├── config.ts                   # Environment variables
│   │   ├── amplify-config.ts           # Cognito setup
│   │   └── i18n.ts                     # react-i18next config
│   ├── public/
│   │   └── locales/                    # Translation files (en, es)
│   ├── package.json
│   ├── next.config.ts
│   └── tsconfig.json
├── knowledge_base_docs/                # Source PDFs for RAG
│   ├── MHFA_InstructorPolicyHandbook_8.6.25.pdf
│   ├── 25.04.14_MHFA Connect User Guide_RW.pdf
│   └── ...
├── docs/
│   ├── architectureDeepDive.md         # Detailed architecture and ADRs
│   ├── deploymentGuide.md              # Complete deployment instructions
│   ├── userGuide.md                    # End-user instructions
│   ├── APIDoc.md                       # API reference
│   ├── modificationGuide.md            # Developer guide for extending
│   ├── projectClosure.md               # Project completion documentation
│   └── media/                          # Images and diagrams
├── LICENSE                             # MIT License
└── README.md                           # This file
```

### Directory Explanations:

1. **backend/** - Contains all backend infrastructure and serverless functions
   - `bin/` - CDK app entry point
   - `lambda/` - AWS Lambda function handlers (Python 3.13)
   - `lib/` - CDK stack definitions (TypeScript)

2. **frontend/** - Next.js frontend application with TypeScript
   - `app/` - Next.js App Router pages and layouts
   - `components/` - Reusable React components
   - `hooks/` - Custom React hooks for streaming chat
   - `contexts/` - React Context providers for state management
   - `lib/` - Configuration and utility functions
   - `public/` - Static assets and translation files

3. **knowledge_base_docs/** - PDF documents for the Bedrock Knowledge Base
   - MHFA instructor handbooks, learner guides, and connect user guides

4. **docs/** - Project documentation
   - `media/` - Images, diagrams, and screenshots for documentation

---

## Removing Commit History

When using this as a template for a new repo, you can strip the entire commit history to start fresh with a single initial commit:

```bash
git checkout --orphan fresh-start
git add -A
git commit -m "Initial commit"
git branch -D main
git branch -m main
git push origin main --force
```

> **Warning:** `--force` rewrites the remote branch history. Only do this on a repo you own and before collaborators have cloned it.

---

## Credits

This application was developed by the ASU AI CIC team in collaboration with AWS and the National Council for Mental Wellbeing.

**Development Team:**
- ASU AI CIC Build Team
- AWS Solutions Architects and Digital Innovation Team

**Client:**
- National Council for Mental Wellbeing

For more information about the project, see the [Project Closure Documentation](./docs/projectClosure.md).

---

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.