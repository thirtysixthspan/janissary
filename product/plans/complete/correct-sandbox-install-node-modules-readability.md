# Correct the sandbox's installation node_modules read-access notes

**Complexity: 1/10** — comment-only edits to 2 production files, with 0 production code lines, behavioral requirements, test scenarios, or new units (p=2.05).

## Summary

The sandbox spec and the `install-reads.ts` profile comment say the running installation's `node_modules` stays denied. `resolveExecutableDirs` instead sets the resolved self-directory parameter to the nearest enclosing `node_modules` tree when a harness executable resolves beneath one. Bundled Claude and Codex ACP role launches use executables in the installation's own `node_modules`, so those launches can read that whole tree.

## Goal

Make the sandbox spec and source comments describe the existing `SELF_DIR_L`/`SELF_DIR_R` carve-in accurately, including the bundled Claude and Codex ACP role-launch case.

## Approach

Keep the current sandbox rules and parameters. Explain that the `ai/`, `scripts/`, and `security/` install-directory carve-ins remain unconditional, while the separate executable carve-in exposes the nearest enclosing `node_modules` tree when a harness or ACP agent executable lives there. State that bundled Claude and Codex role sessions therefore get read access to the installation's `node_modules`, while the installation root and unrelated paths remain denied.

## Implementation

1. Correct the closing paragraph in `src/sandbox/install-reads.ts` to distinguish the three unconditional install-directory carve-ins from the executable-based `node_modules` carve-in.
2. Add a sentence to the `packageRootDir` comment in `src/sandbox/harness-spawn.ts` explaining that bundled Claude and Codex ACP role executables resolve to the installation's `node_modules` tree.

## Tests

No new tests are needed because this change does not alter runtime behavior. Run `./scripts/run.mjs check-diff` after each implementation change; the existing sandbox launch/profile tests must pass unchanged.

## Specification and documentation impact

After implementation and tests, update `product/specs/sandbox.md` to describe the resolved `SELF_DIR_R` widening, amend the `ai/` and `security/` carve-in descriptions, and retain the separate restrictions on the installation root and unrelated paths. Update `documentation/user-documentation/command-bar/tasks.md`, which currently says the rest of the installation stays off limits, to mention the bundled adapter package tree available during Claude and Codex role launches. No help page describes this behavior.

## Backlog

Remove only the resolved first entry from `product/backlog/pull-request.md`, preserving the remaining two entries byte-for-byte.

## Out of scope

- Changing any sandbox profile rule, parameter, or executable-resolution behavior.
- Adding or changing tests.
- Correcting the pull request description or changing either later backlog entry.
