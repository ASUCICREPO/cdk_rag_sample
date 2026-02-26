# Kiro Setup

Standard Kiro configuration for ASU CIC projects, including MCP servers, Powers, and recommended settings.

## Standard MCP Configuration

### Recommended mcp.json

Place this configuration in `.kiro/settings/mcp.json` (workspace level) or `~/.kiro/settings/mcp.json` (user level). Note that for the 'aws-diagram' MCP server, it is recommended to use draw.io as well for best results.

```json
{
  "mcpServers": {
    "git": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-git"],
      "env": {},
      "disabled": false,
      "autoApprove": [],
      "description": "Git operations: status, commit, branch, push, pull, diff, log"
    },
    "context7": {
      "url": "https://mcp.context7.com/mcp",
      "headers": {},
      "disabled": false,
      "autoApprove": [],
      "description": "Up-to-date, version-specific documentation for any library or framework"
    },
    "ash-security": {
      "command": "npx",
      "args": ["-y", "@awslabs/ash-mcp-server"],
      "env": {},
      "disabled": false,
      "autoApprove": [],
      "description": "Automated Security Helper: SAST, IaC scanning, secrets detection, SCA"
    },
    "fetch": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-fetch"],
      "env": {},
      "disabled": false,
      "autoApprove": [],
      "description": "Fetch web content and convert to markdown for documentation access"
    },
    "aws-diagram": {
      "command": "/Users/etloaner/.local/bin/uvx",
      "args": [
        "awslabs.aws-diagram-mcp-server@latest"
      ],
      "env": {
        "FASTMCP_LOG_LEVEL": "ERROR"
      },
      "disabled": false,
      "autoApprove": [
        "generate_diagram"
      ]
    },
  }
}
```

## Kiro Powers Configuration

### Core Powers to Install

Install these powers through the Kiro IDE Powers panel or from [kiro.dev/powers](https://kiro.dev/powers):

1. **AWS Observability** (Critical)
   - CloudWatch Logs, Metrics, Alarms, Application Signals, CloudTrail
   - Replaces direct aws-observability MCP server with guided workflows
   - Better context management through keyword activation
   - Install from: kiro.dev/powers

2. **IAM Policy Autopilot** (Critical)
   - Automates IAM policy generation from code
   - Enforces least privilege (CIC's #1 security requirement)
   - Replaces direct iam-policy-autopilot MCP server
   - Install from: kiro.dev/powers

3. **Build AWS infrastructure with CDK and CloudFormation** (Recommended)
   - CDK best practices, CloudFormation validation, security compliance
   - Replaces direct aws-iac MCP server with guided workflows
   - Complements backend-standards.md steering
   - Install from: kiro.dev/powers

### Optional Powers

These powers may be useful for specific projects but are not required:

- **Build a Power**: Build custom Kiro Powers for team-specific workflows (install when creating custom powers like CIC Deployment Power)
- **AWS Cost Optimization**: For production cost analysis (not critical for prototypes)
- **Design to Code with Figma**: Connect Figma designs to code components, generate design system rules, maintain design-code consistency (useful for UI-heavy projects)
- **Build an Agent with Strands**: Build multi-agent systems using AWS Strands framework (for projects requiring complex agent orchestration)
- **Build an Agent with Amazon Bedrock AgentCore**: Build agents using Amazon Bedrock AgentCore (for projects using Bedrock-native agent patterns)

---

## Installation Instructions

### 1. Install MCP Servers

**Option A: Workspace-level (For project-specific configuration)**
```bash
# Create .kiro/settings directory if it doesn't exist
mkdir -p .kiro/settings

# Copy the mcp.json configuration above to .kiro/settings/mcp.json
```

**Option B: User-level (For personal configuration)**
```bash
# Create ~/.kiro/settings directory if it doesn't exist
mkdir -p ~/.kiro/settings

# Copy the mcp.json configuration above to ~/.kiro/settings/mcp.json
```

### 2. Install Kiro Powers

**Via Kiro IDE**:
1. Open "Powers" tab in side bar (Kiro ghost w/lightning bolt)
2. Search for and install:
   - AWS Observability
   - IAM Policy Autopilot
   - Build AWS Infrastructure with CDK and CloudFormation
3. Browse Powers list for project-specific Powers and add as necessary

### MCP Server Descriptions

#### git
**Purpose**: Version control operations
**Use cases**:
- Check repository status
- Create commits and branches
- Push and pull changes
- View diffs and logs
- Manage branches and tags

**Key tools**:
- git status, diff, log
- git commit, push, pull
- git branch, checkout, merge
- git tag, stash

**When to use**: Any version control operation, commit message generation, branch management

---

#### context7
**Purpose**: Up-to-date library and framework documentation
**Use cases**:
- Get current API documentation for any library
- Find version-specific code examples
- Learn how to use new frameworks
- Verify correct API usage

**Key tools**:
- resolve-library-id: Find the correct library
- query-docs: Get documentation and examples

**When to use**: 
- "How do I use Next.js 15 middleware?"
- "Show me Tailwind CSS grid examples"
- "What's the API for React Query v5?"
- Any time you need current library documentation

**Pro tip**: Extremely lightweight and fast - use liberally for any documentation questions

---

#### ash-security
**Purpose**: Comprehensive automated security scanning
**Use cases**:
- Static Application Security Testing (SAST)
- Infrastructure as Code (IaC) security scanning
- Secrets detection in code and git history
- Software Composition Analysis (SCA) for dependencies
- Security compliance validation

**Key tools**:
- run-sast: Scan code for security vulnerabilities
- run-iac-scan: Validate CloudFormation/CDK for security issues
- run-secrets-scan: Detect hardcoded credentials and secrets
- run-sca: Analyze dependencies for known vulnerabilities
- run-all-scans: Execute comprehensive security audit

**When to use**: 
- Before committing code (pre-commit hook)
- During security reviews
- Before deployments
- When adding new dependencies
- Investigating security incidents

**Critical for CIC**: Automates security validation across all CIC requirements:
- No hardcoded secrets (secrets scan)
- IAM least privilege (IaC scan)
- Secure dependencies (SCA)
- Code vulnerabilities (SAST)

**Integration with security-check hook**: The security-check hook can invoke ASH tools for comprehensive validation

---

#### fetch
**Purpose**: Web content fetching and conversion
**Use cases**:
- Fetch web pages and convert to markdown
- Get latest package versions from npm/PyPI
- Access official documentation from web sources
- Check for breaking changes in changelogs
- Retrieve release notes

**Key tools**:
- fetch: Get web content as markdown

**When to use**:
- "What's the latest version of [package]?"
- "Show me the changelog for [library]"
- "Get the documentation from [URL]"
- Verifying current package versions

**Pro tip**: Complements context7 for documentation that's not in their index

---

## Customization

### Adjusting AWS Region

Edit the `aws-observability` server configuration:

```json
{
  "aws-observability": {
    "env": {
      "AWS_REGION": "us-west-2"  // Change to your region
    }
  }
}
```

### Auto-Approving Tools

To skip approval prompts for specific tools, add to `autoApprove`:

```json
{
  "aws-observability": {
    "autoApprove": [
      "query_cloudwatch_logs",
      "get_cloudwatch_metrics"
    ]
  }
}
```

**Warning**: Only auto-approve read-only tools. Never auto-approve tools that modify resources.

### Disabling Servers

To temporarily disable a server without removing it:

```json
{
  "aws-observability": {
    "disabled": true
  }
}
```

---

## Best Practices

### MCP Configuration

1. **Start with workspace-level config**: Keeps project-specific configuration with the project
2. **Use user-level for personal tools**: Personal preferences and credentials
3. **Use environment variables**: For sensitive values, reference env vars

### Power Usage

1. **Activate powers explicitly**: "Use AWS Observability to debug this Lambda"
2. **Combine powers**: Use multiple powers together for complex tasks
3. **Delegate to subagents**: Let specialized subagents use powers automatically
4. **Build custom powers**: For team-specific workflows that don't fit existing powers

### Security

1. **Never commit AWS credentials**: Use AWS CLI configuration or environment variables
2. **Review auto-approved tools**: Understand what each tool does before auto-approving
3. **Use IAM Policy Autopilot**: Always generate policies from code, never write manually
4. **Regular security audits**: Use security subagent to review IAM policies

---

## Support and Resources

### Documentation

- **Kiro MCP Docs**: [kiro.dev/docs/mcp](https://kiro.dev/docs/mcp)
- **Kiro Powers Docs**: [kiro.dev/docs/powers](https://kiro.dev/docs/powers)
- **AWS MCP Servers**: [awslabs.github.io/mcp](https://awslabs.github.io/mcp)
- **Power Builder Guide**: Activate power-builder power and read steering files

### Getting Help

1. **Kiro Community**: [kiro.dev/community](https://kiro.dev/community)
2. **AWS MCP GitHub**: [github.com/awslabs/mcp](https://github.com/awslabs/mcp)
3. **CIC Template Issues**: File issues in this repository

### Contributing

To contribute improvements to this configuration:

1. Test changes thoroughly
2. Document rationale for changes
3. Update this README
4. Submit pull request with clear description

---
