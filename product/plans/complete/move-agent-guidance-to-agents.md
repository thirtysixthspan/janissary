# Move repository agent guidance to AGENTS.md

**Complexity: 3/10** — this is a bounded repository-guidance migration: one canonical document, a compatibility include, live references, and a small invariant test. The review covers existing structure and workflow but does not change application behavior or introduce an architecture.

## Goal

Make `AGENTS.md` the canonical repository instruction file for every coding agent while preserving Claude Code compatibility through a minimal `CLAUDE.md` include. Keep agent-facing instructions accurate to the current project structure and development workflow.

## Approach

Move the current guidance into `AGENTS.md`, revise its title and current-structure details, and keep `CLAUDE.md` as exactly the `@AGENTS.md` include requested by the issue. Redirect live internal guidance references to the canonical file, including task prompts and configuration diagnostics; leave historical plans unchanged.

Add a small server test that locks the compatibility include and the core reviewed guidance sections in place. Record the repository-level behavior in a focused developer spec.

## Implementation steps

1. Create `AGENTS.md` from the existing repository guidance and update its title, project map, and workflow guidance to reflect the current directories, scripts, configurations, and documentation split.
2. Replace `CLAUDE.md` with the exact `@AGENTS.md` compatibility include.
3. Update live source comments, agent configuration diagnostics, guidelines, and task prompts to name `AGENTS.md`; leave historical plans and arbitrary fixtures untouched.
4. Add a script-level test that verifies the compatibility include and the canonical guide’s reviewed structure and verification guidance.
5. Add a functional spec describing the canonical guide, compatibility include, and required content.

## Tests

- Add `scripts/agent-guidance.test.mjs` to verify `CLAUDE.md` delegates to `AGENTS.md` and that the canonical file records the project map and diff-scoped verification workflow.
- Run `$janissary/scripts/run.mjs check-diff` after each implementation step.

## Verification

- Confirm every live reference points to `AGENTS.md` and only the compatibility include remains in `CLAUDE.md`.
- Run `$janissary/scripts/run.mjs check-diff` successfully after all changes.

## Out of scope

- Rewriting historical plans, backlog records, or external documentation that does not describe the repository instruction file.
- Changing application runtime behavior, package scripts, or agent configuration permissions.
