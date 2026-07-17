# Document soft dependencies: Claude Code, Codex, and OpenCode

**Complexity: 2/10** — documentation-only task, no code changes. Add a new documentation page explaining soft dependencies and list tools that integrate with Janissary.

## Goal

Document that Janissary works alongside (but does not require) Claude Code, Codex, and OpenCode, clarifying these as "soft dependencies" — tools that complement Janissary's workflow but are optional. Users should understand which tools integrate well with Janissary and why.

## Background

- The codebase already mentions Claude Code multiple times in `documentation/user-documentation/getting-started/why-janissary.md` as a comparison point.
- The issue asks to add Claude Code, Codex, and OpenCode as soft dependencies in user documentation.
- "Soft dependencies" in this context means tools that integrate with or complement Janissary's functionality but are not required to be installed or used.
- No existing section documents integrations or optional tools that work alongside Janissary.
- This is a documentation-only change with no code, tests, or specs involved.

## Approach

1. Create a new documentation page: `documentation/user-documentation/integrations/soft-dependencies.md` that explains:
   - What soft dependencies are (tools that integrate with Janissary but aren't required)
   - Claude Code — autonomous code harness, single-task-focused, good for quick autonomous work
   - Codex — (describe its role if it's a separate tool or clarify if it's related to Claude)
   - OpenCode — (describe its role and integration with Janissary)
   - How each tool complements Janissary's multi-agent orchestration

2. Add a reference to this page in the main navigation or "Next steps" section of related docs (likely in `why-janissary.md` or a new integrations index).

## Implementation steps

1. Create directory `documentation/user-documentation/integrations/` if it doesn't exist.
2. Create `documentation/user-documentation/integrations/soft-dependencies.md` with sections for each tool (Claude Code, Codex, OpenCode), explaining what each does and how it works with Janissary.
3. Update `documentation/user-documentation/getting-started/why-janissary.md` to add a reference to the soft dependencies page in the "Next steps" section.

## Tests

No tests needed — this is pure documentation.

## Out of scope

- Any code changes to source files.
- Any changes to package.json or actual package dependencies.
- Creating or modifying functional specs (if the docs are self-contained and clear, no spec change is needed).
- Changes to help.md unless it already documents tool integrations.

## Verification

- New documentation file exists at the expected path.
- Content is clear, factual, and follows the style of existing documentation.
- References are added where appropriate.
