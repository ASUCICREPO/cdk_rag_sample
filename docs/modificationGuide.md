# Project Modification Guide

This guide is for developers who want to extend, customize, or modify the Learning Navigator chatbot system.

---

## Introduction

This document provides guidance on how to modify and extend the Learning Navigator. Whether you want to add new features, change existing behavior, integrate additional data sources, or customize the application for your needs, this guide will help you understand the codebase and make changes effectively.

The Learning Navigator is built with a serverless architecture on AWS, using Next.js for the frontend and AWS CDK for infrastructure. All backend compute runs on Lambda with Python, and the AI capabilities are powered by Amazon Bedrock.

---

## Table of Contents

- [Project Structure Overview](#project-structure-overview)
- [Frontend Modifications](#frontend-modifications)
- [Backend Modifications](#backend-modifications)
- [Adding New Features](#adding-new-features)
- [Changing AI/ML Models](#changing-aiml-models)
- [Database Modifications](#database-modifications)
- [Adding Languages](#adding-languages)
- [Knowledge Base Management](#knowledge-base-management)
- [Best Practices](#best-practices)

---

## Project Structure Overview

```
learning-navigator/
├── backend/
│   ├── bin/backend.ts              # CDK app entry point
│   ├── lib/backend-stack.ts        # Infrastructure definitions (~1260 lines)
│   ├── lambda/                     # Lambda function handlers (Python 3.13)
│   │   ├── chat-handler/           # SSE streaming chat with Bedrock
│   │   ├── lead-capture/           # Unauthenticated lead collection
│   │   ├── feedback-handler/       # Thumbs up/down ratings
│   │   ├── escalation-handler/     # Human support escalation
│   │   ├── admin-handler/          # Dashboard analytics
│   │   └── ingestion-trigger/      # S3 event-driven KB re-indexing
│   ├── cdk.json                    # CDK configuration
│   ├── package.json                # TypeScript dependencies
│   └── tsconfig.json
├── frontend/
│   ├── app/                        # Next.js App Router
│   │   ├── layout.tsx              # Root layout with i18n
│   │   ├── page.tsx                # Main chat page
│   │   └── admin/page.tsx          # Admin dashboard
│   ├── components/                 # React components
│   │   ├── AppShell.tsx            # Auth wrapper, header, sign out
│   │   ├── ChatInterface.tsx       # Main chat UI
│   │   ├── MessageBubble.tsx       # Individual message display
│   │   ├── CitationPanel.tsx       # Source references
│   │   ├── LeadCaptureForm.tsx     # Contact form modal
│   │   ├── EscalationPrompt.tsx    # Escalation dialog
│   │   ├── LanguageSelector.tsx    # EN/ES switcher
│   │   ├── ConversationLog.tsx     # Admin: message history
│   │   ├── AnalyticsPanel.tsx      # Admin: usage stats
│   │   ├── FeedbackAnalytics.tsx   # Admin: rating trends
│   │   └── EscalationQueue.tsx     # Admin: pending escalations
│   ├── hooks/
│   │   └── useStreamingChat.ts     # SSE streaming logic
│   ├── contexts/
│   │   └── LanguageContext.tsx     # i18n state management
│   ├── lib/
│   │   ├── config.ts               # Environment variables
│   │   ├── amplify-config.ts       # Cognito setup
│   │   └── i18n.ts                 # react-i18next config
│   ├── public/locales/             # Translation files
│   │   ├── en/common.json
│   │   └── es/common.json
│   ├── package.json
│   ├── next.config.ts
│   └── tsconfig.json
├── knowledge_base_docs/            # Source PDFs for RAG
│   ├── MHFA_InstructorPolicyHandbook_8.6.25.pdf
│   ├── 25.04.14_MHFA Connect User Guide_RW.pdf
│   └── ...
└── docs/                           # Project documentation
```

---

## Frontend Modifications

### Changing the UI Theme

**Location**: `frontend/app/globals.css`

The application uses Tailwind CSS for styling. To change the color scheme:

1. Modify the Tailwind color classes in `globals.css` or individual components
2. Update the primary color (currently blue-600) throughout components
3. Adjust the background colors (gray-50, white) for light/dark themes

**Example**: Change primary color from blue to purple:
```bash
# Find and replace in frontend/components/
blue-600 → purple-600
blue-700 → purple-700
blue-500 → purple-500
```

### Adding New Pages

**Location**: `frontend/app/`

The Learning Navigator uses Next.js App Router. To add a new page:

1. Create a new directory under `frontend/app/` (e.g., `frontend/app/reports/`)
2. Add a `page.tsx` file with your component
3. Optionally add a `layout.tsx` for page-specific layouts
4. Update navigation in `AppShell.tsx` if needed

**Example**: Add a reports page
```typescript
// frontend/app/reports/page.tsx
'use client';

export default function ReportsPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Reports</h1>
      {/* Your content */}
    </div>
  );
}
```

### Modifying Components

**Location**: `frontend/components/`

All UI components are in the `components/` directory. Key components:

- **ChatInterface.tsx**: Main chat UI with message list and input
- **MessageBubble.tsx**: Individual message rendering with citations
- **AppShell.tsx**: Authentication wrapper and header
- **Admin components**: ConversationLog, AnalyticsPanel, FeedbackAnalytics, EscalationQueue

To modify a component:
1. Locate the component file
2. Update the JSX and logic
3. Test with `npm run dev` in the frontend directory
4. Ensure accessibility (ARIA labels, keyboard navigation) is maintained

### Adding New UI Components

1. Create a new file in `frontend/components/`
2. Use TypeScript with proper type definitions
3. Follow the existing patterns (functional components, hooks)
4. Add `'use client'` directive if the component uses React hooks
5. Import and use in your pages

---

## Backend Modifications

### Adding New Lambda Functions

**Location**: `backend/lambda/`

To add a new Lambda function:

1. **Create the Lambda directory and handler**:
```bash
mkdir backend/lambda/my-new-function
```

2. **Write the handler** (`backend/lambda/my-new-function/index.py`):
```python
# SPDX-License-Identifier: MIT
import json
import os
import boto3

# AWS clients at module level for reuse across warm invocations
dynamodb = boto3.resource('dynamodb')

def lambda_handler(event, context):
    """
    Handler for my new function.
    """
    try:
        # Validate environment variables
        table_name = os.environ.get('TABLE_NAME')
        if not table_name:
            raise ValueError("TABLE_NAME environment variable not set")
        
        # Your business logic here
        table = dynamodb.Table(table_name)
        
        # Return response with CORS headers
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
            },
            'body': json.dumps({'message': 'Success'})
        }
    except ValueError as e:
        return {
            'statusCode': 400,
            'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'error': str(e)})
        }
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'error': 'Internal server error'})
        }
```

3. **Add the Lambda to the CDK stack** (`backend/lib/backend-stack.ts`):
```typescript
this.myNewFunction = new lambda.Function(this, 'MyNewFunction', {
  functionName: `${projectPrefix}-my-new-function`,
  runtime: lambda.Runtime.PYTHON_3_13,
  handler: 'index.lambda_handler',
  code: lambda.Code.fromAsset(path.join(__dirname, '..', 'lambda', 'my-new-function')),
  timeout: cdk.Duration.seconds(30),
  architecture: lambdaArch,
  logGroup: new logs.LogGroup(this, 'MyNewFunctionLogGroup', {
    logGroupName: `/aws/lambda/${projectPrefix}-my-new-function`,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
    retention: logs.RetentionDays.ONE_MONTH,
  }),
  environment: {
    TABLE_NAME: this.conversationsTable.tableName,
  },
});

// Grant permissions
this.conversationsTable.grantReadWriteData(this.myNewFunction);
```

4. **Add API Gateway integration** (if needed):
```typescript
const myNewResource = this.api.root.addResource('my-new-endpoint');
myNewResource.addMethod('POST', new apigateway.LambdaIntegration(this.myNewFunction), {
  authorizer: cognitoAuthorizer,
  authorizationType: apigateway.AuthorizationType.COGNITO,
});
```

5. **Deploy**:
```bash
cd backend
cdk deploy
```

### Modifying the CDK Stack

**Location**: `backend/lib/backend-stack.ts`

The entire infrastructure is defined in a single CDK stack (~1260 lines). Key sections:

- **Lines 1-50**: Imports and stack initialization
- **Lines 51-150**: DynamoDB tables (Conversations, Leads, Feedback, Escalations)
- **Lines 151-250**: S3 buckets (Documents, Vectors, Access Logs)
- **Lines 251-350**: Bedrock Knowledge Base with S3 Vectors
- **Lines 351-450**: Cognito User Pool and Client
- **Lines 451-550**: Lambda functions (chat, lead capture, feedback, escalation, admin, ingestion)
- **Lines 551-650**: API Gateway with Cognito authorizer
- **Lines 651-750**: Amplify Hosting (conditional)
- **Lines 751-850**: CfnOutputs

To modify infrastructure:
1. Locate the relevant section in `backend-stack.ts`
2. Make your changes following CDK L2 construct patterns
3. Run `cdk synth` to validate CloudFormation template
4. Run `cdk diff` to see what will change
5. Run `cdk deploy` to apply changes

### Adding New API Endpoints

To add a new REST API endpoint:

1. Create the Lambda function (see above)
2. Add the API Gateway resource and method:
```typescript
const newResource = this.api.root.addResource('new-endpoint');
newResource.addMethod('POST', new apigateway.LambdaIntegration(this.myNewFunction), {
  authorizer: cognitoAuthorizer,
  authorizationType: apigateway.AuthorizationType.COGNITO,
});

// Add CORS preflight
newResource.addMethod('OPTIONS', new apigateway.MockIntegration({
  integrationResponses: [{
    statusCode: '200',
    responseParameters: {
      'method.response.header.Access-Control-Allow-Headers': "'Content-Type,Authorization'",
      'method.response.header.Access-Control-Allow-Methods': "'GET,POST,OPTIONS'",
      'method.response.header.Access-Control-Allow-Origin': "'*'",
    },
  }],
  passthroughBehavior: apigateway.PassthroughBehavior.NEVER,
  requestTemplates: { 'application/json': '{"statusCode": 200}' },
}), {
  methodResponses: [{
    statusCode: '200',
    responseParameters: {
      'method.response.header.Access-Control-Allow-Headers': true,
      'method.response.header.Access-Control-Allow-Methods': true,
      'method.response.header.Access-Control-Allow-Origin': true,
    },
  }],
});
```

3. Export the endpoint URL:
```typescript
new cdk.CfnOutput(this, 'NewEndpointUrl', {
  value: `${this.api.url}new-endpoint`,
  description: 'New endpoint URL',
});
```

4. Update `docs/APIDoc.md` with the new endpoint documentation

---

## Adding New Features

### Feature: Custom Greeting Messages

**Files to modify**:
- `frontend/components/ChatInterface.tsx`
- `backend/lambda/chat-handler/index.py`

**Steps**:
1. Add greeting logic to `ChatInterface.tsx` in the `useEffect` that initializes the chat
2. Customize greetings based on user role (instructor, internal_staff, learner)
3. Store greeting preferences in DynamoDB if persistence is needed
4. Update translations in `frontend/public/locales/*/common.json`

### Feature: File Upload for Documents

**Files to modify**:
- `frontend/components/ChatInterface.tsx` (add file input)
- `backend/lib/backend-stack.ts` (grant S3 upload permissions)
- `backend/lambda/chat-handler/index.py` (process uploaded files)

**Steps**:
1. Add file input to the chat interface
2. Upload files to the documents S3 bucket using presigned URLs
3. Trigger Knowledge Base ingestion after upload
4. Update the chat handler to reference uploaded documents

### Feature: Conversation Export

**Files to modify**:
- `frontend/components/ChatInterface.tsx` (add export button)
- `backend/lambda/` (create new export-handler)
- `backend/lib/backend-stack.ts` (add Lambda and API endpoint)

**Steps**:
1. Create `export-handler` Lambda that queries Conversations table
2. Generate PDF or JSON export of conversation history
3. Add export button to ChatInterface
4. Call the export API endpoint and trigger download

---

## Changing AI/ML Models

### Switching Bedrock Models

**Location**: `backend/lambda/chat-handler/index.py` and `backend/lib/backend-stack.ts`

The system currently uses Amazon Nova Pro for chat generation. To switch models:

1. **Update the inference profile ARN** in `backend-stack.ts`:
```typescript
// Current: Nova Pro
const modelInferenceProfileArn = `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/us.amazon.nova-pro-v1:0`;
const modelFoundationArn = `arn:aws:bedrock:*::foundation-model/amazon.nova-pro-v1:0`;

// Example: Switch to Claude 3.5 Sonnet
const modelInferenceProfileArn = `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-5-sonnet-20241022-v2:0`;
const modelFoundationArn = `arn:aws:bedrock:*::foundation-model/anthropic.claude-3-5-sonnet-20241022-v2:0`;
```

2. **Update IAM permissions** in the chat handler's policy statement:
```typescript
this.chatHandlerFn.addToRolePolicy(new iam.PolicyStatement({
  sid: 'BedrockInvokeModel',
  actions: ['bedrock:InvokeModelWithResponseStream'],
  resources: [modelInferenceProfileArn, modelFoundationArn],
}));
```

3. **Update the model ID** in `chat-handler/index.py`:
```python
# Current
model_id = "us.amazon.nova-pro-v1:0"

# Example: Switch to Claude
model_id = "anthropic.claude-3-5-sonnet-20241022-v2:0"
```

4. **Adjust the API call** if the new model uses a different API format (Converse vs InvokeModel)

5. **Test thoroughly** — different models have different capabilities, token limits, and response formats

### Switching Embedding Models

**Location**: `backend/lib/backend-stack.ts`

The system uses Titan Embed Text V2 for embeddings. To switch:

1. **Update the embedding model ARN**:
```typescript
// Current: Titan Embed Text V2 (1024 dimensions)
const embeddingModelArn = `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v2:0`;

// Example: Switch to Cohere Embed English
const embeddingModelArn = `arn:aws:bedrock:${this.region}::foundation-model/cohere.embed-english-v3`;
```

2. **Update the vector index dimension** to match the new model:
```typescript
this.vectorIndex = new VectorIndex(this, 'VectorIndex', {
  vectorBucketName: this.vectorsBucket.vectorBucketName,
  indexName: `${projectPrefix}-vector-index`,
  dimension: 1024, // Change to match new model (e.g., 1536 for Cohere)
  distanceMetric: 'cosine',
  dataType: 'float32',
  // ...
});
```

3. **Re-ingest all documents** to generate new embeddings with the new model

### Modifying System Prompts

**Location**: `backend/lambda/chat-handler/index.py`

The system prompt is defined in the chat handler. To modify:

1. Locate the `system_prompt` variable in `lambda_handler`
2. Update the prompt text to change the chatbot's behavior
3. Test with different user roles to ensure role-based personalization still works
4. Consider adding prompt templates for different scenarios

**Example**:
```python
system_prompt = f"""You are the Learning Navigator, an AI assistant for the National Council for Mental Wellbeing's MHFA program.

User role: {user_role}
Language: {language}

Your responsibilities:
- Answer questions about MHFA training, policies, and procedures
- Provide guidance tailored to the user's role
- Cite sources from the knowledge base
- Escalate complex issues to human support when needed

Always be professional, empathetic, and accurate."""
```

---

## Database Modifications

### Adding New Tables

**Location**: `backend/lib/backend-stack.ts`

To add a new DynamoDB table:

1. **Define the table** in the CDK stack:
```typescript
this.myNewTable = new dynamodb.Table(this, 'MyNewTable', {
  tableName: `${projectPrefix}-my-new-table`,
  partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  removalPolicy: cdk.RemovalPolicy.DESTROY,
  pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
  encryption: dynamodb.TableEncryption.AWS_MANAGED,
});
```

2. **Add Global Secondary Indexes** if needed:
```typescript
this.myNewTable.addGlobalSecondaryIndex({
  indexName: 'StatusIndex',
  partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'created_at', type: dynamodb.AttributeType.STRING },
  projectionType: dynamodb.ProjectionType.ALL,
});
```

3. **Grant permissions** to Lambda functions:
```typescript
this.myNewTable.grantReadWriteData(this.myFunction);
```

4. **Pass table name** to Lambda via environment variable:
```typescript
environment: {
  MY_NEW_TABLE_NAME: this.myNewTable.tableName,
}
```

### Modifying Existing Table Schema

DynamoDB is schemaless, so you can add new attributes without modifying the table definition. However, if you need to add a new GSI:

1. **Add the GSI** in `backend-stack.ts` (see above)
2. **Deploy** — CloudFormation will update the table
3. **Backfill data** if the new GSI requires attributes not present in existing items
4. **Update Lambda code** to use the new index

**Note**: Adding a GSI to a table with existing data can take time and consume write capacity.

---

## Adding Languages

**Location**: `frontend/public/locales/` and `frontend/lib/i18n.ts`

The system currently supports English and Spanish. To add a new language:

1. **Create translation file**:
```bash
mkdir frontend/public/locales/fr
cp frontend/public/locales/en/common.json frontend/public/locales/fr/common.json
```

2. **Translate all strings** in `frontend/public/locales/fr/common.json`

3. **Update i18n configuration** in `frontend/lib/i18n.ts`:
```typescript
i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: enCommon },
      es: { common: esCommon },
      fr: { common: frCommon }, // Add this
    },
    lng: 'en',
    fallbackLng: 'en',
    supportedLngs: ['en', 'es', 'fr'], // Add 'fr'
    // ...
  });
```

4. **Update LanguageSelector** component to include the new language option:
```typescript
<option value="fr">Français</option>
```

5. **Update backend** if the chat handler needs to handle the new language for RAG retrieval

---

## Knowledge Base Management

### Adding Documents to the Knowledge Base

**Location**: `knowledge_base_docs/` and S3 bucket

To add new documents:

1. **Add PDF files** to the `knowledge_base_docs/` directory
2. **Upload to S3** (manual or via CDK deployment):
```bash
aws s3 cp knowledge_base_docs/ s3://learning-navigator-documents-<account>-<region>/ --recursive
```

3. **Trigger ingestion** — the `ingestion-trigger` Lambda automatically starts a Knowledge Base ingestion job when new files are uploaded

4. **Verify ingestion** in the Bedrock console or by testing queries

### Changing Chunking Strategy

**Location**: `backend/lib/backend-stack.ts`

The system uses hierarchical chunking (1500 token parents, 300 token children). To change:

1. **Modify the chunking configuration**:
```typescript
vectorIngestionConfiguration: {
  chunkingConfiguration: {
    chunkingStrategy: 'FIXED_SIZE', // or 'HIERARCHICAL', 'SEMANTIC', 'NONE'
    fixedSizeChunkingConfiguration: {
      maxTokens: 500,
      overlapPercentage: 20,
    },
  },
},
```

2. **Re-ingest all documents** to apply the new chunking strategy

3. **Test retrieval quality** — different chunking strategies affect answer quality

### Changing Vector Store

The system uses S3 Vectors. To switch to OpenSearch Serverless:

1. **Remove S3 Vectors** resources from `backend-stack.ts`
2. **Add OpenSearch Serverless** collection and index
3. **Update Knowledge Base** storage configuration to use OpenSearch
4. **Update IAM permissions** for the Knowledge Base role
5. **Re-ingest all documents**

This is a significant change — refer to AWS Bedrock Knowledge Base documentation for OpenSearch configuration.

---

## Best Practices

1. **Test locally before deploying**
   - Frontend: `cd frontend && npm run dev`
   - Backend: `cd backend && cdk synth` to validate CloudFormation
   - Use `cdk diff` to preview infrastructure changes

2. **Use environment variables**
   - Never hardcode API URLs, credentials, or configuration
   - Use `NEXT_PUBLIC_*` prefix for client-side variables
   - Pass backend config via CDK environment variables

3. **Follow existing patterns**
   - Lambda handlers: Python with `lambda_handler(event, context)`
   - Frontend components: TypeScript with functional components and hooks
   - CDK: Use L2 constructs and grant methods for IAM

4. **Update documentation**
   - Update `docs/APIDoc.md` when adding endpoints
   - Update `docs/architectureDeepDive.md` for architectural changes
   - Add ADR comments in code for significant decisions

5. **Version control**
   - Make small, focused commits
   - Use conventional commit messages (`feat:`, `fix:`, `docs:`)
   - Test before pushing

6. **Security**
   - Run `cdk synth` to trigger cdk-nag security checks
   - Fix or suppress findings with documented rationale
   - Never commit `.env` files or secrets
   - Use IAM least privilege (CDK grant methods)

7. **Accessibility**
   - Maintain ARIA labels and keyboard navigation
   - Test with screen readers
   - Ensure color contrast meets WCAG standards

8. **Performance**
   - Use `useMemo` and `useCallback` for expensive operations
   - Implement proper loading states
   - Monitor Lambda cold starts and optimize if needed

---

## Testing Your Changes

### Local Testing

```bash
# Frontend development server
cd frontend
npm install
npm run dev
# Open http://localhost:3000

# Backend validation
cd backend
npm install
cdk synth  # Validates CloudFormation template
cdk diff   # Shows what will change
```

### Deployment Testing

```bash
# Deploy backend changes
cd backend
cdk deploy

# Deploy frontend changes (if using Amplify)
git push origin main  # Triggers Amplify build

# Or deploy frontend manually
cd frontend
npm run build
# Deploy to your hosting platform
```

### Testing Lambda Functions Locally

Use AWS SAM or Lambda test events:

```bash
# Install AWS SAM CLI
brew install aws-sam-cli

# Invoke Lambda locally
sam local invoke ChatHandlerFunction -e test-event.json
```

---

## Troubleshooting

### CDK Deployment Fails

- Run `cdk synth` to see the generated CloudFormation template
- Check for cdk-nag findings and fix or suppress them
- Verify AWS credentials are configured correctly
- Check CloudFormation console for detailed error messages

### Frontend Build Fails

- Check `npm run build` output for TypeScript errors
- Verify environment variables are set correctly
- Check Next.js version compatibility (12-15 for Amplify)
- Review Amplify build logs in the console

### Lambda Function Errors

- Check CloudWatch Logs for the function
- Verify environment variables are set
- Check IAM permissions (use CDK grant methods)
- Test with sample events in the Lambda console

### Knowledge Base Not Returning Results

- Verify documents are uploaded to S3
- Check ingestion job status in Bedrock console
- Test queries directly in the Bedrock console
- Verify vector index configuration matches embedding model dimensions

---

## Conclusion

The Learning Navigator is designed to be extensible and maintainable. This guide covers the most common modification scenarios, but the codebase is well-documented with inline comments and ADRs for architectural decisions.

For questions or support:
- Review the other documentation files in `docs/`
- Check inline code comments for implementation details
- Refer to AWS service documentation for Bedrock, Lambda, DynamoDB, etc.
- Open an issue in the GitHub repository

Happy coding!

