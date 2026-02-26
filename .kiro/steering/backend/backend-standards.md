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

Include SPA rewrite rule (catch-all → index.html); construct `amplifyAppUrl` from `appId` for CORS origins; pass backend URLs/IDs via `addEnvironment`; auto-trigger build on deploy.

```typescript
const amplifyApp = new amplify.App(this, "AmplifyFrontend", {
  sourceCodeProvider: new amplify.GitHubSourceCodeProvider({
    owner: githubOwner, repository: githubRepo, oauthToken: githubTokenSecret.secretValue,
  }),
  buildSpec: cdk.aws_codebuild.BuildSpec.fromObjectToYaml({ /* build config */ }),
  customRules: [{
    source: "</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json)$)([^.]+$)/>",
    target: "/index.html", status: amplify.RedirectStatus.REWRITE,
  }],
});

const mainBranch = amplifyApp.addBranch("main");
const amplifyAppUrl = `https://main.${amplifyApp.appId}.amplifyapp.com`;
mainBranch.addEnvironment('REACT_APP_API_URL', apiUrl);

new AwsCustomResource(this, "TriggerAmplifyBuild", {
  onCreate: {
    service: "Amplify", action: "startJob",
    parameters: { appId: amplifyApp.appId, branchName: "main", jobType: "RELEASE" },
    physicalResourceId: PhysicalResourceId.of(`${amplifyApp.appId}-main-${Date.now()}`),
  },
  onUpdate: { /* same as onCreate */ },
  policy: AwsCustomResourcePolicy.fromSdkCalls({ resources: [/* ARNs */] }),
});
```

## CfnOutput

Export every resource frontend/other stacks consume: API URLs, Function URLs, S3 bucket names, DynamoDB table names, Amplify app URL.

```typescript
new cdk.CfnOutput(this, "ApiUrl", { value: api.url, description: "API Gateway URL" });
```

## IAM

Use CDK grant methods first (`table.grantReadWriteData(fn)`, `bucket.grantRead(fn)`); for Bedrock models use explicit policy statements with specific model ARNs (never wildcard); least privilege always.

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


