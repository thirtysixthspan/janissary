# Document soft dependencies in Prerequisites

**Complexity: 1/10** — documentation-only task, add soft dependencies list to the existing Prerequisites section in install.md.

## Goal

List Claude Code, Codex, and OpenCode as soft dependencies (optional companion tools) in the install.md Prerequisites section, clarifying that these tools complement Janissary but are not required.

## Background

- The install.md file has a Prerequisites section listing required tools.
- Janissary works alongside Claude Code, Codex, and OpenCode but does not require them.
- Adding a brief subsection in the existing Prerequisites keeps the information where users first learn about installation requirements.

## Implementation

Add a "Soft dependencies (optional)" subsection to the Prerequisites section in `documentation/user-documentation/getting-started/install.md` with brief descriptions of each tool.

## Tests

No tests needed — documentation-only change.

## Out of scope

- Creating new documentation pages or integrations specs.
- Modifying documentation beyond install.md.

## Verification

- install.md includes soft dependencies as an optional subsection under Prerequisites.
- The section clearly indicates these tools are optional.
