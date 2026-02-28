---
inclusion: fileMatch
fileMatchPattern: '**/design.md'
---

# Architecture Diagram Standards

## Format: draw.io XML (NOT Mermaid)

When creating or updating architecture diagrams in `design.md` files, ALWAYS use draw.io XML format embedded in a fenced code block. NEVER use Mermaid syntax.

### Template

Architecture sections in design.md must use this structure:

````markdown
## Architecture

```drawio
<mxGraphModel dx="1186" dy="794" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1100" pageHeight="850" math="0" shadow="0">
  <root>
    <mxCell id="0" />
    <mxCell id="1" parent="0" />
    <!-- Architecture cells here -->
  </root>
</mxGraphModel>
```
````

### Draw.io Conventions

- Use AWS 2024 icon shapes when available (search "aws" in draw.io shape library)
- Group related services in containers/swimlanes (Frontend, API Layer, Compute, AI/RAG, Storage, Auth)
- Label all connections with protocol or action (e.g., "HTTPS", "SSE Stream", "Retrieve", "REST")
- Show security boundaries: encryption at rest (lock icon), TLS in transit (HTTPS labels), IAM role assignments
- Use consistent colors per layer: blue for compute, green for storage, orange for AI/ML, purple for auth
- Layout direction: top-to-bottom (users at top, storage at bottom)
- Page size: landscape 1100x850 for readability

### Generating PNG from Architecture

After creating the draw.io XML in design.md, also generate a PNG version using the AWS Diagram MCP server (`generate_diagram` tool with the `diagrams` Python package). Save the PNG to `architecture_diagram/` at the repo root.

Reference the PNG in design.md below the draw.io block:

```markdown
> PNG version: [architecture_diagram/{project-name}-architecture.png](../../../architecture_diagram/{project-name}-architecture.png)
```

### Why draw.io over Mermaid

- draw.io files can be opened and edited visually in VS Code (with draw.io extension), diagrams.net, or any compatible editor
- Supports AWS-specific icons and shapes natively
- Better control over layout, grouping, and visual hierarchy
- Can be exported to PNG/SVG/PDF directly from the editor
- Embeddable in GitHub markdown when saved as SVG
