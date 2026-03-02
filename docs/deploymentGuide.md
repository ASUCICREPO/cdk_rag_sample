# Deployment Guide

Step-by-step instructions for deploying the Learning Navigator.

---

## Table of Contents

- [Requirements](#requirements)
- [Pre-Deployment](#pre-deployment)
- [Deployment](#deployment)
- [Post-Deployment Verification](#post-deployment-verification)
- [Troubleshooting](#troubleshooting)
- [Cleanup](#cleanup)

---

## Requirements

### Accounts
- [ ] AWS Account with Bedrock model access enabled for Amazon Nova Pro and Titan Embed Text V2
- [ ] GitHub account (if deploying frontend via Amplify)

### CLI Tools
- [ ] AWS CLI (v2.x) — [Install AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
- [ ] Node.js (v18.x or later) — [Install Node.js](https://nodejs.org/)
- [ ] npm (v9.x or later) — included with Node.js
- [ ] AWS CDK (v2.x) — `npm install -g aws-cdk`
- [ ] Git — [Install Git](https://git-scm.com/downloads)

### AWS Permissions
- [ ] IAM user/role with permissions for:
  - CloudFormation, Lambda, API Gateway, S3, DynamoDB
  - Cognito, Bedrock, Amplify, Secrets Manager
  - IAM (for creating Lambda execution roles)
  - CloudWatch Logs

### Bedrock Model Access
- [ ] Enable access to the following models in the AWS Bedrock console:
  - Amazon Titan Embed Text V2
  - Amazon Nova Pro

---

## Pre-Deployment

### 1. Configure AWS CLI

```bash
aws configure
```

Enter your AWS Access Key ID, Secret Access Key, region (`us-east-1` recommended), and output format (`json`).

### 2. Bootstrap CDK (first-time only)

```bash
cdk bootstrap aws://<ACCOUNT_ID>/<REGION>
```

### 3. Install Dependencies

```bash
# Backend
cd backend
npm install

# Frontend (for local development)
cd ../frontend
npm install
```

### 4. (Optional) Set Up GitHub Token for Amplify

If deploying the frontend via Amplify with GitHub CI/CD:

1. Create a GitHub personal access token with `repo` scope
2. Store it in AWS Secrets Manager:
   ```bash
   aws secretsmanager create-secret \
     --name learning-navigator/github-token \
     --secret-string "<your-github-token>"
   ```

---

## Deployment

### Backend Deployment

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. (Optional) Review the synthesized CloudFormation template:
   ```bash
   cdk synth
   ```
   This also runs cdk-nag security checks automatically.

3. Review changes before deploying:
   ```bash
   cdk diff
   ```

4. Deploy the stack:

   **Without Amplify** (local frontend development):
   ```bash
   cdk deploy
   ```

   **With Amplify** (full deployment with hosted frontend):
   ```bash
   cdk deploy \
     -c githubOwner=<your-github-username> \
     -c githubRepo=<your-repo-name> \
     -c githubTokenSecretName=learning-navigator/github-token
   ```

5. When prompted, review the IAM changes and type `y` to confirm.

6. Note the stack outputs after deployment:
   - `NavStack.LearningNavigatorApiEndpoint` — API Gateway URL
   - `NavStack.ChatHandlerFunctionUrl` — Chat Function URL
   - `NavStack.UserPoolId` — Cognito User Pool ID
   - `NavStack.UserPoolClientId` — Cognito Client ID
   - `NavStack.AmplifyAppUrl` — Frontend URL (if Amplify enabled)

### Frontend Local Development

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Create `.env.local` from the template:
   ```bash
   cp .env.example .env.local
   ```

3. Fill in the values from CDK stack outputs:
   ```bash
   NEXT_PUBLIC_API_URL=https://<api-id>.execute-api.<region>.amazonaws.com/prod/
   NEXT_PUBLIC_CHAT_FUNCTION_URL=https://<function-url-id>.lambda-url.<region>.on.aws/
   NEXT_PUBLIC_COGNITO_USER_POOL_ID=<region>_xxxxxxxx
   NEXT_PUBLIC_COGNITO_CLIENT_ID=<client-id>
   NEXT_PUBLIC_AWS_REGION=us-east-1
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open `http://localhost:3000` in your browser.

### Create Initial Users

After deployment, create users in the Cognito User Pool:

```bash
# Create an instructor user
aws cognito-idp admin-create-user \
  --user-pool-id <USER_POOL_ID> \
  --username instructor@example.com \
  --user-attributes Name=email,Value=instructor@example.com Name=custom:role,Value=instructor \
  --temporary-password TempPass123!

# Create an internal staff user (for admin dashboard)
aws cognito-idp admin-create-user \
  --user-pool-id <USER_POOL_ID> \
  --username admin@example.com \
  --user-attributes Name=email,Value=admin@example.com Name=custom:role,Value=internal_staff \
  --temporary-password TempPass123!

# Create a learner user
aws cognito-idp admin-create-user \
  --user-pool-id <USER_POOL_ID> \
  --username learner@example.com \
  --user-attributes Name=email,Value=learner@example.com Name=custom:role,Value=learner \
  --temporary-password TempPass123!
```

Users will be prompted to change their password on first sign-in.

---

## Post-Deployment Verification

### 1. Verify Stack Status

```bash
aws cloudformation describe-stacks --stack-name NavStack --query "Stacks[0].StackStatus"
```

Expected: `CREATE_COMPLETE` or `UPDATE_COMPLETE`

### 2. Verify Knowledge Base Ingestion

The 4 MHFA PDFs are automatically uploaded and ingested during deployment. Check the ingestion status:

```bash
aws bedrock-agent list-ingestion-jobs \
  --knowledge-base-id <KB_ID> \
  --data-source-id <DATA_SOURCE_ID>
```

### 3. Test the Lead Capture API

```bash
curl -X POST '<API_URL>/leads' \
  -H 'Content-Type: application/json' \
  -d '{"name": "Test User", "email": "test@example.com", "area_of_interest": "Training"}'
```

Expected: `{"lead_id": "...", "status": "captured"}`

### 4. Test the Frontend

1. Navigate to the application URL (Amplify URL or `http://localhost:3000`)
2. Sign in with a test user
3. Send a test message like "What is Mental Health First Aid?"
4. Verify streaming response with citations

### 5. Test the Admin Dashboard

1. Sign in as an `internal_staff` user
2. Navigate to `/admin`
3. Verify the four tabs load: Conversations, Analytics, Escalations, Feedback

---

## Troubleshooting

### CDK Bootstrap Error
**Symptoms**: Error about CDK not being bootstrapped

**Solution**:
```bash
cdk bootstrap aws://<ACCOUNT_ID>/<REGION>
```

### Bedrock Model Access Denied
**Symptoms**: `AccessDeniedException` when calling Bedrock

**Solution**: Enable model access in the AWS Bedrock console for Amazon Nova Pro and Titan Embed Text V2 in your deployment region.

### Amplify Build Fails
**Symptoms**: Amplify build fails with "deploy-manifest.json not found"

**Solution**: Ensure `AMPLIFY_MONOREPO_APP_ROOT=frontend` is set as an environment variable on both the Amplify app and branch. This is handled automatically by CDK.

### CORS Errors
**Symptoms**: Browser console shows CORS errors on API calls

**Solution**: Verify the frontend URL is included in the CORS allowed origins. For local development, `http://localhost:3000` should be allowed. The CDK stack uses wildcard CORS for the PoC.

### Chat Streaming Not Working
**Symptoms**: Chat responses don't stream, or connection drops

**Solution**: Verify the `NEXT_PUBLIC_CHAT_FUNCTION_URL` points to the Lambda Function URL (not the API Gateway URL). The chat endpoint uses Function URL for SSE streaming.

### Permission Denied on Deploy
**Symptoms**: Access denied errors during `cdk deploy`

**Solution**: Verify your AWS credentials and ensure your IAM user/role has the required permissions for all services in the stack.

---

## Cleanup

To remove all deployed resources:

```bash
cd backend
cdk destroy
```

This will delete all resources including DynamoDB tables, S3 buckets (with `autoDeleteObjects`), Lambda functions, API Gateway, Cognito User Pool, and Amplify app.

> **Warning**: This deletes all data. Back up any important conversation logs or user data before destroying the stack.
