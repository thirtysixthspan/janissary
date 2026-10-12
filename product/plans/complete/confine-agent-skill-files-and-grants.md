# Confine Agent Skill Files and Grants

**Complexity: 4/10** — a small filesystem-boundary change in one resolver and its colocated tests, with existing canonicalization and containment patterns to follow.

## Goal

Prevent a selected skill from loading instructions or command grants through symlinks that point outside that skill's directory.

## Approach

Resolve the selected skill directory and canonicalize it before reading content. Require `SKILL.md` and any existing `janissary.json` to resolve beneath that selected directory, and reject invalid paths before reading them. Preserve workspace-first lookup, installed fallback, and the no-sidecar/no-grants behavior.

## Implementation steps

1. Update `src/agent/skill-grants.ts` to validate the selected directory and canonical paths for both files before reading either.
2. Add tests in `src/agent/task-resolution.test.ts` for a skill-file symlink into a sibling skill and sidecar symlinks into sibling and outside files. Keep existing precedence, fallback, snapshot, and missing-sidecar coverage.
3. Update `product/specs/agent-command.md` to describe per-skill path confinement and the invalid skill path error.

## Tests

- A selected skill whose `SKILL.md` points to a sibling skill is rejected.
- A selected skill whose `janissary.json` points to a sibling or outside file is rejected before its contents are used.
- Existing workspace-first resolution, installed fallback, absent-sidecar grants, and grant validation tests continue to pass.
- Run `./scripts/run.mjs check-diff` after each implementation step and after spec updates.

## Out of scope

- Changing which skill source wins when both workspace and installation provide a skill.
- Changing the behavior of a genuinely absent sidecar.
- Changing task-file path resolution or task-discovery behavior.
