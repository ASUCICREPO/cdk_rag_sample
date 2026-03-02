---
inclusion: fileMatch
fileMatchPattern: "backend/**/*"
---

# CIC Backend Standards

**Languages**: Lambdas (Python), CDK stack (TypeScript). 
**Architecture**: Single stack unless complexity requires otherwise; serverless-first, cost-effective, resilient. Always use latest AWS resources/services; verify with MCP/web search before suggesting changes. Optimize for fewer resources while maintaining clarity. Never change strategy without approval. 

## Project Structure

```
backend/
├── lib/<project>-stack.ts  # CDK stack (TypeScript)
├── lambda/<function>/      # Lambda handlers (Python)
│   ├── index.py            # Entry point
│   └── requirements.txt
├── bin/                    # CDK app entry
├── cdk.json, package.json, tsconfig.json
```

**Naming**: Lambda dirs (kebab-case: `resume-parser`), Python files (snake_case), CDK constructs (PascalCase: `UserTable`), Handler (always `lambda_handler(event, context)`).

## CDK Context Variables

Use `tryGetContext` for deployment-specific config (GitHub tokens, resource IDs). Validate required vars at stack top; throw if missing. Pass via `cdk deploy -c key=value` or `cdk.json` context block.

```typescript
const githubToken = this.node.tryGetContext("githubToken");
if (!githubToken) throw new Error("Missing githubToken");
```

## CORS

Construct frontend URL early: `const amplifyAppUrl = \`https://main.${amplifyApp.appId}.amplifyapp.com\`;`. Use `amplifyAppUrl` + `http://localhost:3000` as allowed origins on all resources (Function URLs, S3, API Gateway). Every Lambda returning to browser must include CORS headers in all responses (including errors) and handle `OPTIONS` for preflight.

```python
def create_response(status_code: int, body: dict) -> dict:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        },
        "body": json.dumps(body),
    }
```

## Lambda Functions

**Handler Pattern**: AWS clients at module level (reused across warm invocations); use `os.environ.get()` never `[]`; validate env vars at start; consistent response shape `{'statusCode': int, 'body': json.dumps(...)}}`; `print()` for logging (CloudWatch captures stdout); keep handlers thin.

```python
import json, boto3, os
dynamodb = boto3.resource('dynamodb')  # Module level

def lambda_handler(event, context):
    try:
        table_name = os.environ.get('TABLE_NAME')
        if not table_name: raise ValueError("TABLE_NAME not set")
        # Business logic
        return {'statusCode': 200, 'body': json.dumps({'data': result})}
    except ValueError as e:
        return {'statusCode': 400, 'body': json.dumps({'error': str(e)})}
    except Exception as e:
        print(f"Error: {str(e)}")
        return {'statusCode': 500, 'body': json.dumps({'error': str(e)})}
```

**CDK Definition**: Use latest supported Python runtime; detect host architecture dynamically; explicit timeout; pass resource names via environment (not ARNs).

```typescript
const hostArch = os.arch();
const lambdaArch = hostArch === "arm64" ? lambda.Architecture.ARM_64 : lambda.Architecture.X86_64;

const myFunction = new lambda.Function(this, "MyFunction", {
  runtime: lambda.Runtime.PYTHON_3_12,
  handler: "index.lambda_handler",
  code: lambda.Code.fromAsset(path.join(__dirname, "..", "lambda", "my-function")),
  timeout: cdk.Duration.minutes(5),
  architecture: lambdaArch,
  environment: { TABLE_NAME: myTable.tableName },
});
```

## DynamoDB

`PAY_PER_REQUEST` billing; point-in-time recovery and encryption enabled; `RETAIN` removal policy for user data (DESTROY only for dev/scratch); use CDK grant methods (`grantReadWriteData`, `grantReadData`).

```typescript
const myTable = new dynamodb.Table(this, "MyTable", {
  partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
  sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  removalPolicy: cdk.RemovalPolicy.RETAIN,
  pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
  encryption: dynamodb.TableEncryption.AWS_MANAGED,
});
myTable.grantReadWriteData(myFunction);
```

## S3

Always `enforceSSL: true`; add CORS only when frontend needs direct bucket access; use CDK grant methods.

```typescript
const myBucket = new s3.Bucket(this, "MyBucket", {
  enforceSSL: true,
  removalPolicy: cdk.RemovalPolicy.RETAIN,
});
myBucket.grantRead(myFunction);
```

## Amplify

**Platform**: Use `WEB_COMPUTE` for Next.js SSR apps. Amplify's compute layer handles all routing automatically.

**CRITICAL — No custom rewrite rules for SSR apps**: Do NOT add SPA-style `customRules` (catch-all → `/index.html`) when using `WEB_COMPUTE` platform. The SPA rewrite intercepts requests before the SSR compute layer, causing 404 errors because there is no static `index.html` in an SSR deployment. Amplify handles routing natively for SSR.

**Next.js version**: Amplify Hosting compute supports Next.js 12–15 only. Do NOT use Next.js 16+ until Amplify officially adds support. Check AWS docs before upgrading.

**Monorepo setup**: For monorepo projects (frontend in a subdirectory), you MUST set `AMPLIFY_MONOREPO_APP_ROOT` as an environment variable on both the app and branch. Without it, Amplify's framework adapter won't generate `deploy-manifest.json` and the build will fail. The value must match the `appRoot` in the buildSpec.

**Auto-build on CDK deploy**: `enableAutoBuild: true` only triggers builds on git pushes, NOT on CDK deploys. To auto-trigger a build after every `cdk deploy`, use an `AwsCustomResource` that calls `amplify:StartJob`. This ensures environment variable changes (API URLs, Cognito IDs) are picked up immediately without a manual rebuild. Use `Date.now()` in the `PhysicalResourceId` to force execution on every deploy.

Construct `amplifyAppUrl` from `appId` for CORS origins; pass backend URLs/IDs via environment variables on the branch.

```typescript
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from 'aws-cdk-lib/custom-resources';

const amplifyApp = new amplify.CfnApp(this, 'AmplifyApp', {
  name: `${projectPrefix}-frontend`,
  repository: `https://github.com/${githubOwner}/${githubRepo}`,
  oauthToken: githubTokenSecret.secretValue.unsafeUnwrap(),
  platform: 'WEB_COMPUTE',
  // Monorepo buildSpec — appRoot tells Amplify where the frontend lives
  buildSpec: [
    'version: 1',
    'applications:',
    '  - appRoot: frontend',
    '    frontend:',
    '      phases:',
    '        preBuild:',
    '          commands:',
    '            - npm ci',
    '        build:',
    '          commands:',
    '            - npm run build',
    '      artifacts:',
    '        baseDirectory: .next',
    '        files:',
    '          - "**/*"',
    '      cache:',
    '        paths:',
    '          - node_modules/**/*',
    '          - .next/cache/**/*',
  ].join('\n'),
  // NO customRules — SSR routing is handled by Amplify compute layer
  environmentVariables: [
    { name: 'AMPLIFY_MONOREPO_APP_ROOT', value: 'frontend' },
    // ... backend URLs set after API/Function URL creation
  ],
});

const amplifyMainBranch = new amplify.CfnBranch(this, 'AmplifyMainBranch', {
  appId: amplifyApp.attrAppId,
  branchName: 'main',
  enableAutoBuild: true,
  stage: 'PRODUCTION',
  environmentVariables: [
    { name: 'AMPLIFY_MONOREPO_APP_ROOT', value: 'frontend' },
    { name: 'NEXT_PUBLIC_API_URL', value: api.url },
    // ... other NEXT_PUBLIC_ vars
  ],
});

// ADR: AwsCustomResource to trigger Amplify build on every CDK deploy
// Rationale: enableAutoBuild only fires on git pushes, not CDK deploys.
//   Environment variable changes (API URLs, Cognito IDs) require a rebuild.
// Alternative: Manual `aws amplify start-job` after deploy (rejected - error-prone)
new AwsCustomResource(this, 'TriggerAmplifyBuild', {
  onCreate: {
    service: 'Amplify',
    action: 'startJob',
    parameters: {
      appId: amplifyApp.attrAppId,
      branchName: 'main',
      jobType: 'RELEASE',
    },
    physicalResourceId: PhysicalResourceId.of(
      `${amplifyApp.attrAppId}-main-${Date.now()}`,
    ),
  },
  onUpdate: {
    service: 'Amplify',
    action: 'startJob',
    parameters: {
      appId: amplifyApp.attrAppId,
      branchName: 'main',
      jobType: 'RELEASE',
    },
    physicalResourceId: PhysicalResourceId.of(
      `${amplifyApp.attrAppId}-main-${Date.now()}`,
    ),
  },
  policy: AwsCustomResourcePolicy.fromSdkCalls({
    resources: [
      `arn:aws:amplify:${this.region}:${this.account}:apps/${amplifyApp.attrAppId}`,
      `arn:aws:amplify:${this.region}:${this.account}:apps/${amplifyApp.attrAppId}/branches/main/jobs/*`,
    ],
  }),
});
```

## CfnOutput

Export every resource frontend/other stacks consume: API URLs, Function URLs, S3 bucket names, DynamoDB table names, Amplify app URL.

```typescript
new cdk.CfnOutput(this, "ApiUrl", { value: api.url, description: "API Gateway URL" });
```

## IAM

Use CDK grant methods first (`table.grantReadWriteData(fn)`, `bucket.grantRead(fn)`); for Bedrock models use explicit policy statements with specific model ARNs (never wildcard); least privilege always.

## RAG Chatbots with S3 Vectors

For projects that use Bedrock Knowledge Base + S3 Vectors for RAG, follow the patterns in #[[file:.kiro/steering/backend/s3-vectors-rag-chatbot.md]]. Covers S3 Vectors bucket/index setup (TypeScript + Python CDK), Bedrock KB wiring, Lambda retrieval, ingestion patterns, and cdk-nag suppressions.

## Security Scanning with cdk-nag

cdk-nag is integrated directly in `backend/lib/backend-stack.ts` via `Aspects.of(this).add(new AwsSolutionsChecks({ verbose: true }))`. It runs automatically on every `cdk synth` and `cdk deploy` — no extra setup needed.

When findings appear, either fix the resource config or suppress with an ADR-format reason using `NagSuppressions.addResourceSuppressions()`. See `backend-stack.ts` for the pattern.

## Documenting Architectural Decisions

When making significant architectural choices in CDK/Lambda code, document the decision:

**In architectureDeepDive.md**: Add formal ADR entry with context, alternatives, rationale, consequences.

**In code comments**: Reference the decision where implemented.

```typescript
// ADR: Lambda architecture detection for ARM64/x86_64 compatibility
// Rationale: Supports development on both Apple Silicon and Intel Macs
// Alternative: Hardcode ARM64 (rejected - breaks Intel Mac developers)
const hostArch = os.arch();
const lambdaArch = hostArch === "arm64" ? lambda.Architecture.ARM_64 : lambda.Architecture.X86_64;
```

**Document decisions about**: Service selection (OpenSearch vs S3+DynamoDB), model choices (Bedrock model selection), architecture patterns (event-driven vs request-response), data storage (DynamoDB vs RDS), scaling strategies (serverless vs provisioned).


