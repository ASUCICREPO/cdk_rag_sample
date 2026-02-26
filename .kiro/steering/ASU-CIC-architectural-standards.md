---
inclusion: always
---

# ASU CIC Architectural Standards

Universal standards that apply to all CIC projects. Domain-specific guidance is in separate steering files that auto-load based on context.

## Core Principles

1. **Backend first** - Design and implement backend before frontend
2. **Security is non-negotiable** - IAM least privilege, no hardcoded secrets, PII protection
3. **No hardcoding** - Extract all configuration dynamically at runtime
4. **Validate compliance** - Verify standards before finalizing changes
5. **Follow tech stack** - Use specified frameworks unless justified
6. **Document deviations** - Explain changes in code comments

Flag conflicts with these standards and propose alternatives.


## Technology Stack

- **Frontend**: Next.js (latest stable) with TypeScript, AWS Amplify, Tailwind CSS
- **Backend**: AWS CDK (TypeScript), Lambda (Python, latest supported runtime)
- **Architecture**: Serverless-first (Lambda, DynamoDB, S3, API Gateway)
- **Infrastructure**: CDK L2/L3 constructs, no manual console configs
- **Dependencies**: Always install latest stable versions; check for updates before starting work; verify compatibility and review breaking changes in changelogs

## Project Structure

```
project/
├── frontend/
│   ├── app/              # Next.js App Router
│   ├── components/       # UI components
│   ├── hooks/           # Custom React hooks
│   ├── lib/             # API clients, utilities
│   └── contexts/        # React Context providers
└── backend/
    ├── lib/             # CDK stack definitions (TypeScript)
    ├── lambda/          # Lambda handlers (Python)
    └── bin/             # CDK app entry point
```

## Documentation

**README.md**: Project overview, setup, deployment quick start. 
**docs/architectureDeepDive.md**: Detailed architecture, services used, data flow, architectural decisions (ADRs).
**docs/deploymentGuide.md**: Complete deployment instructions.
**docs/userGuide.md**: End-user instructions.
**docs/APIDoc.md**: API reference.
**docs/modificationGuide.md**: Developer guide for extending the project.
**docs/ADR_TEMPLATE.md**: Template for documenting architectural decisions.

**Architectural Decision Records (ADRs)**: Document significant architectural choices in `docs/architectureDeepDive.md` under "Architectural Decisions" section. Include context, alternatives considered, rationale, and consequences. Reference decisions in code comments where implemented (format: `// ADR: [title] | Rationale: [summary] | Alternative: [rejected option]`).

Search official docs when unfamiliar with services/libraries; verify API usage and best practices before implementation; document architectural decisions and deviations.


## Security Fundamentals

**IAM Least Privilege (Non-Negotiable)**
- Grant minimum required permissions per Lambda/service
- Use resource-specific ARNs, never wildcards (`*`)
- Never use `Action: "*"` in policies
- Use CDK grant methods: `table.grantReadWriteData(fn)`, `bucket.grantRead(fn)`

**Secrets Management**
- Store credentials in Secrets Manager or SSM Parameter Store
- Never hardcode secrets; reference via environment variables
- Access at runtime, not build time; rotate regularly

**PII Protection**
- Redact PII from CloudWatch logs
- Use placeholders in test data: `[email]`, `[phone_number]`
- Store PII in encrypted tables; validate and sanitize input

**Encryption**
- Enable encryption at rest (DynamoDB, S3, EFS) with AWS managed keys
- Enforce HTTPS/TLS for all endpoints

**Authentication**
- Use Cognito for user authentication
- Validate JWT tokens; implement session management; use MFA for admins


## Language Standards

**TypeScript** - Strict mode, prefer interfaces, export types, meaningful names
**Python** - PEP 8, type hints, thin handlers, `lambda_handler(event, context)` entry point

## Validation Checklist

Before committing code, verify:
- [ ] No hardcoded secrets, credentials, or configuration
- [ ] IAM permissions use specific ARNs, not wildcards
- [ ] All data stores have encryption enabled
- [ ] PII is not logged to CloudWatch
- [ ] Latest stable dependency versions used
- [ ] Code follows language-specific style guidelines
- [ ] Architecture decisions are documented

