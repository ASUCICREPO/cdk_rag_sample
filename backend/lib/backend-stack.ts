// SPDX-License-Identifier: MIT
import * as cdk from 'aws-cdk-lib';
import { Aspects, Tags } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AwsSolutionsChecks, NagSuppressions } from 'cdk-nag';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as amplify from 'aws-cdk-lib/aws-amplify';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as os from 'os';
import * as path from 'path';
import { Bucket as VectorsBucket, Index as VectorIndex } from 'cdk-s3-vectors';

export class NavStack extends cdk.Stack {
  // Expose resources for other stacks/tasks
  public readonly conversationsTable: dynamodb.Table;
  public readonly leadsTable: dynamodb.Table;
  public readonly feedbackTable: dynamodb.Table;
  public readonly escalationsTable: dynamodb.Table;
  public readonly documentsBucket: s3.Bucket;
  public readonly vectorsBucket: VectorsBucket;
  public readonly vectorIndex: VectorIndex;
  public readonly knowledgeBase: bedrock.CfnKnowledgeBase;
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly chatHandlerFn: lambda.Function;
  public readonly chatHandlerUrl: lambda.FunctionUrl;
  public readonly leadCaptureFn: lambda.Function;
  public readonly feedbackHandlerFn: lambda.Function;
  public readonly escalationHandlerFn: lambda.Function;
  public readonly adminHandlerFn: lambda.Function;
  public readonly ingestionTriggerFn: lambda.Function;
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ADR: cdk-nag scoped to stack, not app entry point
    // Rationale: Self-contained security checks travel with the stack when used as a template
    // Alternative: Aspects.of(app) in bin/backend.ts (rejected - doesn't travel with stack)
    Aspects.of(this).add(new AwsSolutionsChecks({ verbose: true }));

    const projectPrefix = 'learning-navigator';

    // ADR: Consistent resource tagging for traceability
    // Rationale: Tags enable cost tracking, ownership, and environment identification
    // Alternative: No tags (rejected - violates CIC deployment consistency standards)
    Tags.of(this).add('Project', projectPrefix);
    Tags.of(this).add('ManagedBy', 'CDK');

    // ---------------------------------------------------------------
    // 1.1 DynamoDB Tables
    // ADR: PAY_PER_REQUEST billing for all tables
    // Rationale: Unpredictable traffic patterns in chatbot; avoids over-provisioning
    // Alternative: Provisioned capacity (rejected - requires traffic estimation upfront)
    // ---------------------------------------------------------------

    // Conversations table — stores chat message history per session
    this.conversationsTable = new dynamodb.Table(this, 'ConversationsTable', {
      tableName: `${projectPrefix}-conversations`,
      partitionKey: { name: 'session_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    this.conversationsTable.addGlobalSecondaryIndex({
      indexName: 'RoleLanguageIndex',
      partitionKey: { name: 'user_role', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Leads table — stores lead capture records from unauthenticated users
    this.leadsTable = new dynamodb.Table(this, 'LeadsTable', {
      tableName: `${projectPrefix}-leads`,
      partitionKey: { name: 'lead_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'created_at', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // Feedback table — stores thumbs up/down ratings on chatbot responses
    this.feedbackTable = new dynamodb.Table(this, 'FeedbackTable', {
      tableName: `${projectPrefix}-feedback`,
      partitionKey: { name: 'message_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'session_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    this.feedbackTable.addGlobalSecondaryIndex({
      indexName: 'SessionFeedbackIndex',
      partitionKey: { name: 'session_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'created_at', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Escalations table — stores escalation requests for human follow-up
    this.escalationsTable = new dynamodb.Table(this, 'EscalationsTable', {
      tableName: `${projectPrefix}-escalations`,
      partitionKey: { name: 'escalation_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'created_at', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    this.escalationsTable.addGlobalSecondaryIndex({
      indexName: 'StatusIndex',
      partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'created_at', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ---------------------------------------------------------------
    // 1.2 S3 Documents Bucket (Knowledge Base source)
    // ADR: S3_MANAGED encryption for document storage
    // Rationale: Sufficient for MHFA training docs; avoids KMS key management overhead
    // Alternative: SSE-KMS (rejected - adds cost/complexity without PII in source docs)
    // ---------------------------------------------------------------

    // Access logs bucket for audit trail on documents bucket
    const accessLogsBucket = new s3.Bucket(this, 'AccessLogsBucket', {
      bucketName: `${projectPrefix}-access-logs-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
    });

    this.documentsBucket = new s3.Bucket(this, 'DocumentsBucket', {
      bucketName: `${projectPrefix}-documents-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      serverAccessLogsBucket: accessLogsBucket,
      serverAccessLogsPrefix: 'documents-bucket-logs/',
    });

    // ---------------------------------------------------------------
    // 1.3 S3 Vectors Bucket and Vector Index
    // ADR: S3 Vectors for RAG vector storage instead of OpenSearch
    // Rationale: Serverless, no cluster management, cost-effective for chatbot workload
    // Alternative: OpenSearch Serverless (rejected - higher cost, operational overhead)
    // ---------------------------------------------------------------

    this.vectorsBucket = new VectorsBucket(this, 'VectorsBucket', {
      vectorBucketName: `${projectPrefix}-vectors-${this.account}-${this.region}`,
    });

    // ADR: dimension=1024 for Titan Embed Text V2, cosine distance
    // Rationale: Matches Titan V2 output dimensions; cosine is standard for text similarity
    // Alternative: Euclidean distance (rejected - cosine better for normalized text embeddings)
    this.vectorIndex = new VectorIndex(this, 'VectorIndex', {
      vectorBucketName: this.vectorsBucket.vectorBucketName,
      indexName: `${projectPrefix}-vector-index`,
      dimension: 1024,
      distanceMetric: 'cosine',
      dataType: 'float32',
      metadataConfiguration: {
        nonFilterableMetadataKeys: ['AMAZON_BEDROCK_TEXT', 'AMAZON_BEDROCK_METADATA'],
      },
    });

    // ---------------------------------------------------------------
    // 1.4 Bedrock Knowledge Base with Titan Embed Text V2
    // ADR: HIERARCHICAL chunking strategy for structured PDFs
    // Rationale: Parent (1500 tokens) captures full sections; child (300 tokens) enables
    //   granular semantic search. Search on children, return parents for comprehensive context.
    //   Ideal for policy handbooks, user guides, brand guidelines.
    // Alternative: FIXED_SIZE chunking (rejected - loses document structure context)
    // ---------------------------------------------------------------

    const embeddingModelArn = `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v2:0`;

    // KB IAM role with least-privilege permissions
    const knowledgeBaseRole = new iam.Role(this, 'KnowledgeBaseRole', {
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com', {
        conditions: {
          StringEquals: { 'aws:SourceAccount': this.account },
        },
      }),
      description: 'IAM role for Bedrock Knowledge Base to access S3 Vectors, embedding model, and documents',
    });

    // S3 Vectors permissions — wildcard required, resource-level ARNs not yet documented
    knowledgeBaseRole.addToPolicy(new iam.PolicyStatement({
      sid: 'S3VectorsAccess',
      actions: [
        's3vectors:CreateIndex',
        's3vectors:GetIndex',
        's3vectors:DeleteIndex',
        's3vectors:PutVectors',
        's3vectors:GetVectors',
        's3vectors:DeleteVectors',
        's3vectors:QueryVectors',
        's3vectors:ListIndexes',
      ],
      resources: ['*'],
    }));

    // Bedrock embedding model — scoped to specific model ARN
    knowledgeBaseRole.addToPolicy(new iam.PolicyStatement({
      sid: 'BedrockEmbeddingAccess',
      actions: ['bedrock:InvokeModel'],
      resources: [embeddingModelArn],
    }));

    // S3 read access on documents bucket — uses CDK grant method
    this.documentsBucket.grantRead(knowledgeBaseRole);

    // ADR: CfnKnowledgeBase with addPropertyOverride for S3 Vectors storage
    // Rationale: CDK L1 types (aws-cdk-lib 2.215.0) don't include S3VectorsConfiguration yet.
    //   CloudFormation supports type=S3_VECTORS with S3VectorsConfiguration property.
    //   Using addPropertyOverride to set the correct CloudFormation properties.
    // Alternative: Wait for CDK update (rejected - blocks development)
    this.knowledgeBase = new bedrock.CfnKnowledgeBase(this, 'KnowledgeBase', {
      name: `${projectPrefix}-kb`,
      description: 'MHFA documentation knowledge base for Learning Navigator chatbot',
      roleArn: knowledgeBaseRole.roleArn,
      knowledgeBaseConfiguration: {
        type: 'VECTOR',
        vectorKnowledgeBaseConfiguration: {
          embeddingModelArn: embeddingModelArn,
        },
      },
      // Storage config set via addPropertyOverride below (S3_VECTORS not in CDK types yet)
      storageConfiguration: {
        type: 'S3_VECTORS',
      } as bedrock.CfnKnowledgeBase.StorageConfigurationProperty,
    });

    // Override with the correct CloudFormation S3VectorsConfiguration property
    const vectorsBucketArn = `arn:aws:s3vectors:${this.region}:${this.account}:bucket/${projectPrefix}-vectors-${this.account}-${this.region}`;
    this.knowledgeBase.addPropertyOverride('StorageConfiguration.S3VectorsConfiguration', {
      VectorBucketArn: vectorsBucketArn,
      IndexName: `${projectPrefix}-vector-index`,
    });

    // Ensure S3 Vectors bucket and index are created before the Knowledge Base
    this.knowledgeBase.node.addDependency(this.vectorsBucket);
    this.knowledgeBase.node.addDependency(this.vectorIndex);

    // S3 data source with hierarchical chunking
    const documentsDataSource = new bedrock.CfnDataSource(this, 'DocumentsDataSource', {
      knowledgeBaseId: this.knowledgeBase.attrKnowledgeBaseId,
      name: `${projectPrefix}-documents-source`,
      description: 'MHFA training documents from S3',
      dataSourceConfiguration: {
        type: 'S3',
        s3Configuration: {
          bucketArn: this.documentsBucket.bucketArn,
        },
      },
      vectorIngestionConfiguration: {
        chunkingConfiguration: {
          chunkingStrategy: 'HIERARCHICAL',
          hierarchicalChunkingConfiguration: {
            levelConfigurations: [
              { maxTokens: 1500 }, // Parent: full sections/policies
              { maxTokens: 300 },  // Child: granular paragraphs for semantic search
            ],
            overlapTokens: 60,
          },
        },
      },
    });

    // ---------------------------------------------------------------
    // 1.5 Cognito User Pool with custom role attribute
    // ADR: Cognito for authentication with custom:role attribute
    // Rationale: Managed auth service; custom attribute enables role-based personalization
    //   without a separate user profile table
    // Alternative: Custom JWT issuer (rejected - unnecessary complexity for this use case)
    // ---------------------------------------------------------------

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `${projectPrefix}-user-pool`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      customAttributes: {
        role: new cognito.StringAttribute({
          mutable: true,
          minLen: 1,
          maxLen: 50,
        }),
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      userPoolClientName: `${projectPrefix}-client`,
      authFlows: {
        userSrp: true,
        userPassword: true,
      },
      preventUserExistenceErrors: true,
    });

    // ---------------------------------------------------------------
    // 13.1 AWS Amplify Hosting (conditional)
    // ADR: Amplify Hosting for Next.js frontend with GitHub source
    // Rationale: Managed hosting with CI/CD from GitHub, automatic HTTPS,
    //   and environment variable injection for backend URLs.
    // Alternative: S3 + CloudFront (rejected - no built-in CI/CD or SSR support)
    //
    // ADR: L1 CfnApp/CfnBranch instead of @aws-cdk/aws-amplify-alpha
    // Rationale: Avoids adding an alpha dependency; L1 constructs are stable
    //   and sufficient for this use case.
    // Alternative: @aws-cdk/aws-amplify-alpha (rejected - alpha stability risk)
    //
    // Context variables are optional — stack deploys without Amplify for
    // local development. Pass via: cdk deploy -c githubOwner=... -c githubRepo=... -c githubTokenSecretName=...
    // ---------------------------------------------------------------

    const githubOwner = this.node.tryGetContext('githubOwner') as string | undefined;
    const githubRepo = this.node.tryGetContext('githubRepo') as string | undefined;
    const githubTokenSecretName = this.node.tryGetContext('githubTokenSecretName') as string | undefined;

    const isAmplifyEnabled = !!(githubOwner && githubRepo && githubTokenSecretName);

    // Compute CORS allowed origins
    // ADR: Wildcard CORS for PoC | Rationale: Avoids circular dependency between Amplify
    //   and API Gateway/Function URL. Will tighten to specific origins for production.
    // Alternative: Amplify URL in corsOrigins (rejected - creates CloudFormation circular dependency)
    let amplifyAppUrl: string | undefined;
    let amplifyApp: amplify.CfnApp | undefined;
    let amplifyMainBranch: amplify.CfnBranch | undefined;
    const corsOrigins: string[] = ['*'];

    if (isAmplifyEnabled) {
      // Retrieve GitHub OAuth token from Secrets Manager (never hardcoded)
      const githubTokenSecret = secretsmanager.Secret.fromSecretNameV2(
        this, 'GitHubTokenSecret', githubTokenSecretName!,
      );

      // Amplify App with GitHub source code provider
      // ADR: Minimal buildSpec with monorepo appRoot for Next.js auto-detection
      // Rationale: Amplify auto-detects Next.js and generates deploy-manifest.json
      //   when the appRoot points to the frontend/ subdirectory. No custom artifacts needed.
      // Alternative: Custom buildSpec with .amplify-hosting baseDirectory (rejected - fragile)
      amplifyApp = new amplify.CfnApp(this, 'AmplifyApp', {
        name: `${projectPrefix}-frontend`,
        description: 'Learning Navigator Next.js frontend hosted on AWS Amplify',
        repository: `https://github.com/${githubOwner}/${githubRepo}`,
        oauthToken: githubTokenSecret.secretValue.unsafeUnwrap(),
        platform: 'WEB_COMPUTE',
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
        // ADR: No custom rewrite rules for SSR (WEB_COMPUTE)
        // Rationale: Amplify's compute layer handles SSR routing automatically.
        //   SPA-style rewrite rules (catch-all → /index.html) conflict with SSR
        //   because there is no static index.html in an SSR deployment.
        // Alternative: SPA rewrite rule (rejected - causes 404 on SSR apps)
      });

      amplifyAppUrl = `https://main.${amplifyApp.attrAppId}.amplifyapp.com`;

      // Add "main" branch with environment variables for the frontend
      amplifyMainBranch = new amplify.CfnBranch(this, 'AmplifyMainBranch', {
        appId: amplifyApp.attrAppId,
        branchName: 'main',
        enableAutoBuild: true,
        stage: 'PRODUCTION',
      });

    }

    // ---------------------------------------------------------------
    // 2.7 Chat Handler Lambda with Function URL (streaming)
    // ADR: Lambda Function URL with streaming invoke mode for SSE
    // Rationale: API Gateway does not support SSE streaming natively.
    //   Function URL provides built-in HTTPS, streaming, and lower latency.
    // Alternative: API Gateway + WebSocket (rejected - more complex, SSE is simpler)
    // ---------------------------------------------------------------

    // ADR: Lambda architecture detection for ARM64/x86_64 compatibility
    // Rationale: Supports development on both Apple Silicon and Intel Macs
    // Alternative: Hardcode ARM64 (rejected - breaks Intel Mac developers)
    const hostArch = os.arch();
    const lambdaArch = hostArch === 'arm64'
      ? lambda.Architecture.ARM_64
      : lambda.Architecture.X86_64;

    // ADR: Inference profile ARN for Nova Pro on-demand invocation
    // Rationale: Bedrock requires inference profiles for on-demand Nova Pro.
    //   Direct foundation model ARN invocation returns ValidationException.
    // Alternative: Foundation model ARN (rejected — no longer supported for on-demand)
    const novaProInferenceProfileArn = `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/us.amazon.nova-pro-v1:0`;
    // IAM also needs the underlying foundation model ARNs that the inference profile routes to
    const novaProFoundationModelArn = `arn:aws:bedrock:*::foundation-model/amazon.nova-pro-v1:0`;

    this.chatHandlerFn = new lambda.Function(this, 'ChatHandlerFunction', {
      functionName: `${projectPrefix}-chat-handler`,
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '..', 'lambda', 'chat-handler')),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      architecture: lambdaArch,
      logGroup: new logs.LogGroup(this, 'ChatHandlerLogGroup', {
        logGroupName: `/aws/lambda/${projectPrefix}-chat-handler`,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        retention: logs.RetentionDays.ONE_MONTH,
      }),
      environment: {
        CONVERSATIONS_TABLE_NAME: this.conversationsTable.tableName,
        KNOWLEDGE_BASE_ID: this.knowledgeBase.attrKnowledgeBaseId,
        USER_POOL_ID: this.userPool.userPoolId,
        REGION: this.region,
        ALLOWED_ORIGINS: corsOrigins.join(','),
      },
    });

    // DynamoDB read/write on conversations table — CDK grant method (least privilege)
    this.conversationsTable.grantReadWriteData(this.chatHandlerFn);

    // Bedrock KB Retrieve — scoped to specific Knowledge Base ARN
    this.chatHandlerFn.addToRolePolicy(new iam.PolicyStatement({
      sid: 'BedrockKBRetrieve',
      actions: ['bedrock:Retrieve'],
      resources: [
        `arn:aws:bedrock:${this.region}:${this.account}:knowledge-base/${this.knowledgeBase.attrKnowledgeBaseId}`,
      ],
    }));

    // Bedrock ConverseStream — scoped to Nova Pro inference profile + underlying model ARNs
    this.chatHandlerFn.addToRolePolicy(new iam.PolicyStatement({
      sid: 'BedrockInvokeModel',
      actions: ['bedrock:InvokeModelWithResponseStream'],
      resources: [novaProInferenceProfileArn, novaProFoundationModelArn],
    }));

    // Function URL with streaming invoke mode and CORS
    this.chatHandlerUrl = this.chatHandlerFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      invokeMode: lambda.InvokeMode.RESPONSE_STREAM,
      cors: {
        allowedOrigins: corsOrigins,
        allowedMethods: [lambda.HttpMethod.POST],
        allowedHeaders: [
          'Content-Type',
          'Authorization',
          'X-Amz-Date',
          'X-Api-Key',
          'X-Amz-Security-Token',
        ],
      },
    });

    // ---------------------------------------------------------------
    // 4.2 Lead Capture Lambda
    // ADR: Unauthenticated endpoint for lead capture
    // Rationale: Prospective users submit contact info before signing up.
    //   JWT auth is not required; API Gateway will handle rate limiting in Task 9.
    // Alternative: Require auth (rejected - defeats purpose of lead capture)
    // ---------------------------------------------------------------

    this.leadCaptureFn = new lambda.Function(this, 'LeadCaptureFunction', {
      functionName: `${projectPrefix}-lead-capture`,
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '..', 'lambda', 'lead-capture')),
      timeout: cdk.Duration.seconds(30),
      architecture: lambdaArch,
      logGroup: new logs.LogGroup(this, 'LeadCaptureLogGroup', {
        logGroupName: `/aws/lambda/${projectPrefix}-lead-capture`,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        retention: logs.RetentionDays.ONE_MONTH,
      }),
      environment: {
        LEADS_TABLE_NAME: this.leadsTable.tableName,
      },
    });

    // DynamoDB write on leads table — CDK grant method (least privilege)
    this.leadsTable.grantWriteData(this.leadCaptureFn);

    // ---------------------------------------------------------------
    // 5.2 Feedback Handler Lambda
    // Requirement 11.2 — Lambda with Python runtime for backend compute
    // ---------------------------------------------------------------

    this.feedbackHandlerFn = new lambda.Function(this, 'FeedbackHandlerFunction', {
      functionName: `${projectPrefix}-feedback-handler`,
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '..', 'lambda', 'feedback-handler')),
      timeout: cdk.Duration.seconds(30),
      architecture: lambdaArch,
      logGroup: new logs.LogGroup(this, 'FeedbackHandlerLogGroup', {
        logGroupName: `/aws/lambda/${projectPrefix}-feedback-handler`,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        retention: logs.RetentionDays.ONE_MONTH,
      }),
      environment: {
        FEEDBACK_TABLE_NAME: this.feedbackTable.tableName,
        USER_POOL_ID: this.userPool.userPoolId,
        REGION: this.region,
      },
    });

    // DynamoDB write on feedback table — CDK grant method (least privilege)
    this.feedbackTable.grantWriteData(this.feedbackHandlerFn);

    // ---------------------------------------------------------------
    // 6.2 Escalation Handler Lambda
    // Requirement 11.2 — Lambda with Python runtime for backend compute
    // ---------------------------------------------------------------

    this.escalationHandlerFn = new lambda.Function(this, 'EscalationHandlerFunction', {
      functionName: `${projectPrefix}-escalation-handler`,
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '..', 'lambda', 'escalation-handler')),
      timeout: cdk.Duration.seconds(30),
      architecture: lambdaArch,
      logGroup: new logs.LogGroup(this, 'EscalationHandlerLogGroup', {
        logGroupName: `/aws/lambda/${projectPrefix}-escalation-handler`,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        retention: logs.RetentionDays.ONE_MONTH,
      }),
      environment: {
        ESCALATIONS_TABLE_NAME: this.escalationsTable.tableName,
        USER_POOL_ID: this.userPool.userPoolId,
        REGION: this.region,
      },
    });

    // DynamoDB write on escalations table — CDK grant method (least privilege)
    this.escalationsTable.grantWriteData(this.escalationHandlerFn);

    // ---------------------------------------------------------------
    // 7.7 Admin Handler Lambda
    // ADR: Admin handler reads from multiple tables for dashboard aggregation
    // Rationale: Single Lambda serves all admin dashboard routes; needs read on
    //   Conversations, Feedback, Escalations. Write on Escalations for PATCH resolve.
    // Alternative: Separate Lambdas per admin route (rejected - unnecessary complexity)
    // ---------------------------------------------------------------

    this.adminHandlerFn = new lambda.Function(this, 'AdminHandlerFunction', {
      functionName: `${projectPrefix}-admin-handler`,
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '..', 'lambda', 'admin-handler')),
      timeout: cdk.Duration.seconds(30),
      architecture: lambdaArch,
      logGroup: new logs.LogGroup(this, 'AdminHandlerLogGroup', {
        logGroupName: `/aws/lambda/${projectPrefix}-admin-handler`,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        retention: logs.RetentionDays.ONE_MONTH,
      }),
      environment: {
        CONVERSATIONS_TABLE_NAME: this.conversationsTable.tableName,
        FEEDBACK_TABLE_NAME: this.feedbackTable.tableName,
        ESCALATIONS_TABLE_NAME: this.escalationsTable.tableName,
        USER_POOL_ID: this.userPool.userPoolId,
        REGION: this.region,
      },
    });

    // DynamoDB read on Conversations and Feedback tables
    this.conversationsTable.grantReadData(this.adminHandlerFn);
    this.feedbackTable.grantReadData(this.adminHandlerFn);

    // DynamoDB read+write on Escalations table (write needed for PATCH resolve)
    this.escalationsTable.grantReadWriteData(this.adminHandlerFn);

    // ---------------------------------------------------------------
    // 8.2 Ingestion Trigger Lambda
    // ADR: S3 event-driven ingestion for automatic KB re-indexing
    // Rationale: New documents uploaded to S3 automatically trigger Bedrock
    //   KB ingestion. No manual intervention needed after document upload.
    // Alternative: Manual ingestion via console (rejected - error-prone, not automated)
    // ---------------------------------------------------------------

    this.ingestionTriggerFn = new lambda.Function(this, 'IngestionTriggerFunction', {
      functionName: `${projectPrefix}-ingestion-trigger`,
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '..', 'lambda', 'ingestion-trigger')),
      timeout: cdk.Duration.seconds(30),
      architecture: lambdaArch,
      logGroup: new logs.LogGroup(this, 'IngestionTriggerLogGroup', {
        logGroupName: `/aws/lambda/${projectPrefix}-ingestion-trigger`,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        retention: logs.RetentionDays.ONE_MONTH,
      }),
      environment: {
        KNOWLEDGE_BASE_ID: this.knowledgeBase.attrKnowledgeBaseId,
        DATA_SOURCE_ID: documentsDataSource.attrDataSourceId,
      },
    });

    // S3 event notification — trigger on new/updated objects
    this.documentsBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(this.ingestionTriggerFn),
    );

    // Bedrock StartIngestionJob — scoped to specific Knowledge Base ARN
    this.ingestionTriggerFn.addToRolePolicy(new iam.PolicyStatement({
      sid: 'BedrockStartIngestion',
      actions: ['bedrock:StartIngestionJob'],
      resources: [
        `arn:aws:bedrock:${this.region}:${this.account}:knowledge-base/${this.knowledgeBase.attrKnowledgeBaseId}`,
      ],
    }));

    // ---------------------------------------------------------------
    // 9.1 API Gateway REST API with Cognito Authorizer
    // ADR: API Gateway REST API for CRUD endpoints (not chat streaming)
    // Rationale: Standard request/response endpoints benefit from API Gateway's
    //   built-in request validation, throttling, and Cognito authorizer integration.
    //   Chat uses Function URL for SSE streaming (API GW doesn't support SSE).
    // Alternative: All endpoints via Function URLs (rejected - loses throttling,
    //   authorizer integration, and structured route management)
    // ---------------------------------------------------------------

    this.api = new apigateway.RestApi(this, 'LearningNavigatorApi', {
      restApiName: `${projectPrefix}-api`,
      description: 'Learning Navigator REST API for leads, feedback, escalations, and admin',
      deployOptions: {
        stageName: 'prod',
        throttlingBurstLimit: 50,
        throttlingRateLimit: 100,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: corsOrigins,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'Authorization',
          'X-Amz-Date',
          'X-Api-Key',
          'X-Amz-Security-Token',
        ],
      },
    });

    // Cognito authorizer for authenticated endpoints
    const cognitoAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [this.userPool],
      authorizerName: `${projectPrefix}-cognito-authorizer`,
    });

    // --- POST /leads (unauthenticated) ---
    const leadsResource = this.api.root.addResource('leads');
    leadsResource.addMethod('POST', new apigateway.LambdaIntegration(this.leadCaptureFn));

    // --- POST /feedback (authenticated) ---
    const feedbackResource = this.api.root.addResource('feedback');
    feedbackResource.addMethod('POST', new apigateway.LambdaIntegration(this.feedbackHandlerFn), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // --- POST /escalations (authenticated) ---
    const escalationsResource = this.api.root.addResource('escalations');
    escalationsResource.addMethod('POST', new apigateway.LambdaIntegration(this.escalationHandlerFn), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // --- Admin routes (authenticated, role check in Lambda) ---
    const adminResource = this.api.root.addResource('admin');

    // GET /admin/conversations
    const adminConversations = adminResource.addResource('conversations');
    adminConversations.addMethod('GET', new apigateway.LambdaIntegration(this.adminHandlerFn), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // GET /admin/conversations/{session_id}
    const adminConversationById = adminConversations.addResource('{session_id}');
    adminConversationById.addMethod('GET', new apigateway.LambdaIntegration(this.adminHandlerFn), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // GET /admin/analytics
    const adminAnalytics = adminResource.addResource('analytics');
    adminAnalytics.addMethod('GET', new apigateway.LambdaIntegration(this.adminHandlerFn), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // GET /admin/analytics/sentiment
    const adminSentiment = adminAnalytics.addResource('sentiment');
    adminSentiment.addMethod('GET', new apigateway.LambdaIntegration(this.adminHandlerFn), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // GET /admin/feedback
    const adminFeedback = adminResource.addResource('feedback');
    adminFeedback.addMethod('GET', new apigateway.LambdaIntegration(this.adminHandlerFn), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // GET /admin/escalations
    const adminEscalations = adminResource.addResource('escalations');
    adminEscalations.addMethod('GET', new apigateway.LambdaIntegration(this.adminHandlerFn), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // PATCH /admin/escalations/{id}
    const adminEscalationById = adminEscalations.addResource('{id}');
    adminEscalationById.addMethod('PATCH', new apigateway.LambdaIntegration(this.adminHandlerFn), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // ---------------------------------------------------------------
    // 13.1 Amplify environment variables and outputs (deferred from above)
    // Environment variables are set on the branch after API Gateway and
    // Function URL are created, so their URLs are available as tokens.
    // ---------------------------------------------------------------

    if (isAmplifyEnabled && amplifyApp && amplifyMainBranch && amplifyAppUrl) {
      // Set environment variables on the branch now that API/Function URLs exist
      amplifyMainBranch.environmentVariables = [
        { name: 'AMPLIFY_MONOREPO_APP_ROOT', value: 'frontend' },
        { name: 'NEXT_PUBLIC_API_URL', value: this.api.url },
        { name: 'NEXT_PUBLIC_CHAT_FUNCTION_URL', value: this.chatHandlerUrl.url },
        { name: 'NEXT_PUBLIC_COGNITO_USER_POOL_ID', value: this.userPool.userPoolId },
        { name: 'NEXT_PUBLIC_COGNITO_CLIENT_ID', value: this.userPoolClient.userPoolClientId },
        { name: 'NEXT_PUBLIC_AWS_REGION', value: this.region },
      ];

      // Also set app-level environment variables as defaults
      // ADR: AMPLIFY_MONOREPO_APP_ROOT required for CloudFormation-deployed monorepo apps
      // Rationale: Per AWS docs, when deploying a monorepo app via CloudFormation/CDK,
      //   AMPLIFY_MONOREPO_APP_ROOT must be set manually to match the appRoot in buildSpec.
      //   Without it, Amplify's Next.js framework adapter doesn't generate deploy-manifest.json.
      // Alternative: Remove monorepo buildSpec (rejected - app lives in frontend/ subdirectory)
      amplifyApp.environmentVariables = [
        { name: 'AMPLIFY_MONOREPO_APP_ROOT', value: 'frontend' },
        { name: 'NEXT_PUBLIC_API_URL', value: this.api.url },
        { name: 'NEXT_PUBLIC_CHAT_FUNCTION_URL', value: this.chatHandlerUrl.url },
        { name: 'NEXT_PUBLIC_COGNITO_USER_POOL_ID', value: this.userPool.userPoolId },
        { name: 'NEXT_PUBLIC_COGNITO_CLIENT_ID', value: this.userPoolClient.userPoolClientId },
        { name: 'NEXT_PUBLIC_AWS_REGION', value: this.region },
      ];

      // CfnOutputs for Amplify
      new cdk.CfnOutput(this, 'AmplifyAppUrl', {
        value: amplifyAppUrl,
        description: 'Amplify frontend application URL',
      });

      new cdk.CfnOutput(this, 'AmplifyAppId', {
        value: amplifyApp.attrAppId,
        description: 'Amplify App ID',
      });

      // ---------------------------------------------------------------
      // 13.2 Auto-trigger Amplify build on CDK deploy
      // ADR: AwsCustomResource to trigger Amplify build on every CDK deploy
      // Rationale: enableAutoBuild only fires on git pushes, not CDK deploys.
      //   Environment variable changes (API URLs, Cognito IDs) require a rebuild
      //   to be picked up by the Next.js frontend at build time.
      // Alternative: Manual `aws amplify start-job` after deploy (rejected - error-prone)
      // ---------------------------------------------------------------
      new cr.AwsCustomResource(this, 'TriggerAmplifyBuild', {
        onCreate: {
          service: 'Amplify',
          action: 'startJob',
          parameters: {
            appId: amplifyApp.attrAppId,
            branchName: 'main',
            jobType: 'RELEASE',
          },
          physicalResourceId: cr.PhysicalResourceId.of(
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
          physicalResourceId: cr.PhysicalResourceId.of(
            `${amplifyApp.attrAppId}-main-${Date.now()}`,
          ),
        },
        policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
          resources: [
            `arn:aws:amplify:${this.region}:${this.account}:apps/${amplifyApp.attrAppId}`,
            `arn:aws:amplify:${this.region}:${this.account}:apps/${amplifyApp.attrAppId}/branches/main/jobs/*`,
          ],
        }),
      });
    }

    // ---------------------------------------------------------------
    // 14.1 Upload Knowledge Base Documents via BucketDeployment
    // ADR: s3deploy.BucketDeployment for initial KB document upload
    // Rationale: Uploads the 4 MHFA PDFs from the local knowledge_base_docs/
    //   directory to the S3 documents bucket during CDK deploy. The existing
    //   S3 PutObject event notification on the documents bucket automatically
    //   triggers the ingestion Lambda, which starts a Bedrock KB ingestion job.
    //   This ensures the Knowledge Base is populated on first deploy without
    //   manual intervention.
    // Alternative: Manual upload via AWS CLI (rejected - error-prone, not automated)
    // Requirements: 2.1, 2.5
    // ---------------------------------------------------------------

    const kbDocsDeployment = new s3deploy.BucketDeployment(this, 'KBDocumentsDeployment', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '..', '..', 'knowledge_base_docs'))],
      destinationBucket: this.documentsBucket,
      serverSideEncryption: s3deploy.ServerSideEncryption.AES_256,
      retainOnDelete: true,
    });

    // ---------------------------------------------------------------
    // 1.6 cdk-nag Suppressions
    // ---------------------------------------------------------------

    const stackName = cdk.Stack.of(this).stackName;

    // KB role uses wildcard for S3 Vectors — resource-level ARNs not yet documented
    NagSuppressions.addResourceSuppressions(
      knowledgeBaseRole,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'ADR: S3 Vectors wildcard permissions | Rationale: S3 Vectors resource-level ARNs not yet documented by AWS. Will tighten when available. | Alternative: None currently available.',
          appliesTo: ['Resource::*'],
        },
        {
          id: 'AwsSolutions-IAM5',
          reason: 'ADR: CDK grantRead() wildcard actions | Rationale: CDK grantRead() generates s3:GetBucket*, s3:GetObject*, s3:List* which are standard read patterns scoped to the documents bucket ARN. | Alternative: Manual policy (rejected - CDK grant methods are the recommended pattern).',
          appliesTo: [
            'Action::s3:GetBucket*',
            'Action::s3:GetObject*',
            'Action::s3:List*',
            `Resource::<DocumentsBucket9EC9DEB9.Arn>/*`,
          ],
        },
      ],
      true,
    );

    // cdk-s3-vectors internal constructs — managed by the L3 construct
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `/${stackName}/VectorsBucket`,
      [
        { id: 'AwsSolutions-L1', reason: 'ADR: cdk-s3-vectors internal construct | Rationale: Lambda runtime managed by cdk-s3-vectors package. | Alternative: Fork package (rejected - maintenance burden).' },
        { id: 'AwsSolutions-IAM4', reason: 'ADR: cdk-s3-vectors internal construct | Rationale: Managed policies used internally by cdk-s3-vectors. | Alternative: Fork package (rejected - maintenance burden).' },
        { id: 'AwsSolutions-IAM5', reason: 'ADR: cdk-s3-vectors internal construct | Rationale: Wildcard permissions managed internally by cdk-s3-vectors. | Alternative: Fork package (rejected - maintenance burden).' },
      ],
      true,
    );

    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `/${stackName}/VectorIndex`,
      [
        { id: 'AwsSolutions-L1', reason: 'ADR: cdk-s3-vectors internal construct | Rationale: Lambda runtime managed by cdk-s3-vectors package. | Alternative: Fork package (rejected - maintenance burden).' },
        { id: 'AwsSolutions-IAM4', reason: 'ADR: cdk-s3-vectors internal construct | Rationale: Managed policies used internally by cdk-s3-vectors. | Alternative: Fork package (rejected - maintenance burden).' },
        { id: 'AwsSolutions-IAM5', reason: 'ADR: cdk-s3-vectors internal construct | Rationale: Wildcard permissions managed internally by cdk-s3-vectors. | Alternative: Fork package (rejected - maintenance burden).' },
      ],
      true,
    );

    // Cognito User Pool — advanced security and MFA not required for PoC
    NagSuppressions.addResourceSuppressions(
      this.userPool,
      [
        {
          id: 'AwsSolutions-COG2',
          reason: 'ADR: MFA not enforced for PoC | Rationale: MFA adds friction for initial testing. Will enable for production. | Alternative: Enforce MFA (deferred to production hardening).',
        },
        {
          id: 'AwsSolutions-COG3',
          reason: 'ADR: Advanced security mode not enforced for PoC | Rationale: AdvancedSecurityMode ENFORCED adds cost for adaptive authentication. Will enable for production. | Alternative: Enable ENFORCED (deferred to production hardening).',
        },
      ],
    );

    // Access logs bucket is the log destination — logging itself would create infinite loop
    NagSuppressions.addResourceSuppressions(
      accessLogsBucket,
      [
        {
          id: 'AwsSolutions-S1',
          reason: 'ADR: Access logs bucket is the log destination | Rationale: Enabling access logging on the log bucket itself creates an infinite loop. This is the standard AWS pattern. | Alternative: None.',
        },
      ],
    );

    // Chat Handler Lambda — CDK grant methods generate wildcard sub-actions
    NagSuppressions.addResourceSuppressions(
      this.chatHandlerFn,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'ADR: Lambda basic execution role | Rationale: AWSLambdaBasicExecutionRole is required for CloudWatch Logs access. This is the standard AWS pattern for Lambda functions. | Alternative: Custom policy with logs:CreateLogGroup, logs:CreateLogStream, logs:PutLogEvents (rejected - managed policy is the CDK default and recommended pattern).',
          appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
        },
        {
          id: 'AwsSolutions-IAM5',
          reason: 'ADR: CDK grantReadWriteData() wildcard actions | Rationale: CDK grant methods generate standard DynamoDB action patterns (dynamodb:BatchGetItem*, dynamodb:GetItem*, etc.) scoped to the conversations table ARN. | Alternative: Manual policy (rejected - CDK grant methods are the recommended pattern).',
        },
      ],
      true,
    );

    // Lead Capture Lambda — CDK grant methods generate wildcard sub-actions
    NagSuppressions.addResourceSuppressions(
      this.leadCaptureFn,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'ADR: Lambda basic execution role | Rationale: AWSLambdaBasicExecutionRole is required for CloudWatch Logs access. This is the standard AWS pattern for Lambda functions. | Alternative: Custom policy (rejected - managed policy is the CDK default and recommended pattern).',
          appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
        },
        {
          id: 'AwsSolutions-IAM5',
          reason: 'ADR: CDK grantWriteData() wildcard actions | Rationale: CDK grant methods generate standard DynamoDB action patterns scoped to the leads table ARN. | Alternative: Manual policy (rejected - CDK grant methods are the recommended pattern).',
        },
      ],
      true,
    );

    // Feedback Handler Lambda — CDK grant methods generate wildcard sub-actions
    NagSuppressions.addResourceSuppressions(
      this.feedbackHandlerFn,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'ADR: Lambda basic execution role | Rationale: AWSLambdaBasicExecutionRole is required for CloudWatch Logs access. This is the standard AWS pattern for Lambda functions. | Alternative: Custom policy (rejected - managed policy is the CDK default and recommended pattern).',
          appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
        },
        {
          id: 'AwsSolutions-IAM5',
          reason: 'ADR: CDK grantWriteData() wildcard actions | Rationale: CDK grant methods generate standard DynamoDB action patterns scoped to the feedback table ARN. | Alternative: Manual policy (rejected - CDK grant methods are the recommended pattern).',
        },
      ],
      true,
    );

    // Escalation Handler Lambda — CDK grant methods generate wildcard sub-actions
    NagSuppressions.addResourceSuppressions(
      this.escalationHandlerFn,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'ADR: Lambda basic execution role | Rationale: AWSLambdaBasicExecutionRole is required for CloudWatch Logs access. This is the standard AWS pattern for Lambda functions. | Alternative: Custom policy (rejected - managed policy is the CDK default and recommended pattern).',
          appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
        },
        {
          id: 'AwsSolutions-IAM5',
          reason: 'ADR: CDK grantWriteData() wildcard actions | Rationale: CDK grant methods generate standard DynamoDB action patterns scoped to the escalations table ARN. | Alternative: Manual policy (rejected - CDK grant methods are the recommended pattern).',
        },
      ],
      true,
    );

    // Admin Handler Lambda — CDK grant methods generate wildcard sub-actions
    NagSuppressions.addResourceSuppressions(
      this.adminHandlerFn,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'ADR: Lambda basic execution role | Rationale: AWSLambdaBasicExecutionRole is required for CloudWatch Logs access. This is the standard AWS pattern for Lambda functions. | Alternative: Custom policy (rejected - managed policy is the CDK default and recommended pattern).',
          appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
        },
        {
          id: 'AwsSolutions-IAM5',
          reason: 'ADR: CDK grantReadData()/grantReadWriteData() wildcard actions | Rationale: CDK grant methods generate standard DynamoDB action patterns scoped to Conversations, Feedback, and Escalations table ARNs. | Alternative: Manual policy (rejected - CDK grant methods are the recommended pattern).',
        },
      ],
      true,
    );

    // Ingestion Trigger Lambda — CDK grant methods generate wildcard sub-actions
    NagSuppressions.addResourceSuppressions(
      this.ingestionTriggerFn,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'ADR: Lambda basic execution role | Rationale: AWSLambdaBasicExecutionRole is required for CloudWatch Logs access. This is the standard AWS pattern for Lambda functions. | Alternative: Custom policy (rejected - managed policy is the CDK default and recommended pattern).',
          appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
        },
        {
          id: 'AwsSolutions-IAM5',
          reason: 'ADR: CDK S3 event notification wildcard actions | Rationale: S3 event notification setup by CDK generates standard permissions for Lambda invocation scoped to the documents bucket. | Alternative: Manual policy (rejected - CDK grant methods are the recommended pattern).',
        },
      ],
      true,
    );

    // S3 BucketNotificationsHandler — internal CDK construct for S3 event notifications
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `/${stackName}/BucketNotificationsHandler050a0587b7544547bf325f094a3db834/Role/Resource`,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'ADR: CDK S3 BucketNotificationsHandler internal construct | Rationale: CDK creates an internal Lambda to manage S3 bucket notifications. It uses AWSLambdaBasicExecutionRole which is the standard pattern. | Alternative: None — this is a CDK-managed internal resource.',
          appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
        },
      ],
    );

    // BucketDeployment internal constructs — CDK creates a Lambda + IAM role for S3 asset upload
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `/${stackName}/Custom::CDKBucketDeployment8693BB64968944B69AAFB0CC9EB8756C/Resource`,
      [
        {
          id: 'AwsSolutions-L1',
          reason: 'ADR: CDK BucketDeployment internal construct | Rationale: Lambda runtime is managed by the CDK s3-deployment module. Cannot control runtime version. | Alternative: Custom deployment script (rejected - BucketDeployment is the CDK-recommended pattern).',
        },
      ],
    );

    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `/${stackName}/Custom::CDKBucketDeployment8693BB64968944B69AAFB0CC9EB8756C/ServiceRole/Resource`,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'ADR: CDK BucketDeployment internal construct | Rationale: BucketDeployment creates an internal Lambda that uses AWSLambdaBasicExecutionRole for CloudWatch Logs access. This is the standard CDK pattern. | Alternative: None — this is a CDK-managed internal resource.',
          appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
        },
      ],
    );

    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `/${stackName}/Custom::CDKBucketDeployment8693BB64968944B69AAFB0CC9EB8756C/ServiceRole/DefaultPolicy/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'ADR: CDK BucketDeployment internal construct | Rationale: BucketDeployment generates wildcard S3 actions (s3:GetObject*, s3:List*) scoped to the source asset bucket and destination documents bucket. These are standard CDK-generated permissions for asset deployment. | Alternative: None — this is a CDK-managed internal resource.',
        },
      ],
    );

    // TriggerAmplifyBuild AwsCustomResource — internal Lambda + IAM for amplify:StartJob
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `/${stackName}/TriggerAmplifyBuild/CustomResourcePolicy/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'ADR: AwsCustomResource auto-build trigger | Rationale: fromSdkCalls() generates a policy scoped to the Amplify app and branch job ARNs with a wildcard on job IDs (required — job IDs are generated at runtime). | Alternative: None — job IDs are not known at deploy time.',
        },
      ],
    );

    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `/${stackName}/AWS679f53fac002430cb0da5b7982bd2287/Resource`,
      [
        {
          id: 'AwsSolutions-L1',
          reason: 'ADR: AwsCustomResource internal Lambda | Rationale: Lambda runtime is managed by the CDK custom-resources module. Cannot control runtime version. | Alternative: Custom Lambda (rejected - AwsCustomResource is the CDK-recommended pattern for SDK calls).',
        },
      ],
    );

    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `/${stackName}/AWS679f53fac002430cb0da5b7982bd2287/ServiceRole/Resource`,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'ADR: AwsCustomResource internal Lambda | Rationale: CDK creates an internal Lambda for SDK calls that uses AWSLambdaBasicExecutionRole for CloudWatch Logs access. This is the standard CDK pattern. | Alternative: None — this is a CDK-managed internal resource.',
          appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
        },
      ],
    );

    // API Gateway — cdk-nag suppressions for default methods and deployment
    NagSuppressions.addResourceSuppressions(
      this.api,
      [
        {
          id: 'AwsSolutions-APIG2',
          reason: 'ADR: Request validation deferred to Lambda handlers | Rationale: Each Lambda handler validates its own input with specific business rules. API Gateway request models would duplicate validation logic. | Alternative: API Gateway request validators (rejected - duplicates Lambda validation).',
        },
        {
          id: 'AwsSolutions-IAM4',
          reason: 'ADR: API Gateway CloudWatch role | Rationale: API Gateway uses AmazonAPIGatewayPushToCloudWatchLogs managed policy for logging. This is the standard AWS pattern. | Alternative: Custom policy (rejected - managed policy is the AWS-recommended pattern).',
        },
        {
          id: 'AwsSolutions-APIG1',
          reason: 'ADR: API Gateway access logging deferred for PoC | Rationale: Access logging requires a CloudWatch log group and additional configuration. Will enable for production. | Alternative: Enable access logging (deferred to production hardening).',
        },
        {
          id: 'AwsSolutions-APIG3',
          reason: 'ADR: WAF not attached for PoC | Rationale: WAF adds cost and complexity for a PoC. API Gateway throttling provides basic protection. Will add WAF for production. | Alternative: Attach WAF (deferred to production hardening).',
        },
        {
          id: 'AwsSolutions-APIG6',
          reason: 'ADR: CloudWatch logging for API Gateway methods deferred for PoC | Rationale: Method-level logging requires additional configuration. Lambda handlers provide structured logging. | Alternative: Enable method logging (deferred to production hardening).',
        },
        {
          id: 'AwsSolutions-APIG4',
          reason: 'ADR: OPTIONS methods do not require authorization | Rationale: CORS preflight OPTIONS requests must be unauthenticated per the CORS specification. Browsers send OPTIONS without credentials. | Alternative: None — CORS spec requires unauthenticated OPTIONS.',
        },
        {
          id: 'AwsSolutions-COG4',
          reason: 'ADR: OPTIONS methods and POST /leads do not use Cognito authorizer | Rationale: CORS preflight must be unauthenticated. Lead capture is intentionally unauthenticated for prospective users. | Alternative: Require auth on leads (rejected - defeats purpose of lead capture).',
        },
      ],
      true,
    );

    // ---------------------------------------------------------------
    // CfnOutputs — export resource identifiers for other tasks
    // ---------------------------------------------------------------

    new cdk.CfnOutput(this, 'ConversationsTableName', {
      value: this.conversationsTable.tableName,
      description: 'DynamoDB Conversations table name',
    });

    new cdk.CfnOutput(this, 'LeadsTableName', {
      value: this.leadsTable.tableName,
      description: 'DynamoDB Leads table name',
    });

    new cdk.CfnOutput(this, 'FeedbackTableName', {
      value: this.feedbackTable.tableName,
      description: 'DynamoDB Feedback table name',
    });

    new cdk.CfnOutput(this, 'EscalationsTableName', {
      value: this.escalationsTable.tableName,
      description: 'DynamoDB Escalations table name',
    });

    new cdk.CfnOutput(this, 'DocumentsBucketName', {
      value: this.documentsBucket.bucketName,
      description: 'S3 documents bucket for KB source',
    });

    new cdk.CfnOutput(this, 'VectorsBucketName', {
      value: this.vectorsBucket.vectorBucketName,
      description: 'S3 Vectors bucket name',
    });

    new cdk.CfnOutput(this, 'KnowledgeBaseId', {
      value: this.knowledgeBase.attrKnowledgeBaseId,
      description: 'Bedrock Knowledge Base ID',
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
    });

    new cdk.CfnOutput(this, 'ChatHandlerFunctionUrl', {
      value: this.chatHandlerUrl.url,
      description: 'Chat Handler Lambda Function URL (SSE streaming)',
    });

    new cdk.CfnOutput(this, 'LeadCaptureFunctionName', {
      value: this.leadCaptureFn.functionName,
      description: 'Lead Capture Lambda function name',
    });

    new cdk.CfnOutput(this, 'FeedbackHandlerFunctionName', {
      value: this.feedbackHandlerFn.functionName,
      description: 'Feedback Handler Lambda function name',
    });

    new cdk.CfnOutput(this, 'EscalationHandlerFunctionName', {
      value: this.escalationHandlerFn.functionName,
      description: 'Escalation Handler Lambda function name',
    });

    new cdk.CfnOutput(this, 'AdminHandlerFunctionName', {
      value: this.adminHandlerFn.functionName,
      description: 'Admin Handler Lambda function name',
    });

    new cdk.CfnOutput(this, 'IngestionTriggerFunctionName', {
      value: this.ingestionTriggerFn.functionName,
      description: 'Ingestion Trigger Lambda function name',
    });

    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: this.api.url,
      description: 'API Gateway REST API URL',
    });
  }
}
