# Confine Agent Skill Roots

**Complexity: 4/10** — a focused filesystem-boundary check in the existing skill resolver, with colocated symlink tests and a small spec update.

## Goal

Prevent workspace or installation `skills/` roots from redirecting agent instruction or grant reads outside their permitted source.

## Approach

Canonicalize each source root before inspecting a skill. Require the canonical workspace `skills/` root to remain inside the canonical workspace and the installed `skills/` root to remain inside the canonical installation. Reject an escaping root with the existing invalid-skill-path error before reading a skill file or sidecar. Preserve workspace-first resolution, selected-directory checks, and missing-sidecar behavior.

## Implementation steps

1. `src/agent/skill-grants.ts` validates each canonical skill root against its canonical source root before looking up a skill.
2. `src/agent/task-resolution.test.ts` covers workspace and installation `skills/` root symlink escapes and rejects external content.
3. `product/specs/agent-command.md` describes source-root confinement.

## Tests

- A workspace `skills/` root symlinked outside the workspace is rejected before instruction or sidecar content can be loaded.
- An installation `skills/` root symlinked outside the installation is rejected before instruction or sidecar content can be loaded.
- Existing skill-directory symlink, source-precedence, absent-sidecar, and grant validation cases continue to pass.
- Diff-scoped lint, typecheck, and tests passed after implementation.

## Out of scope

- Changing workspace-first skill resolution or installed fallback behavior for valid roots.
- Changing selected skill directory or sidecar validation.
- Changing agent task discovery or resolution.
