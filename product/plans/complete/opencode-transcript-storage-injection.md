# Honor explicit OpenCode transcript storage

**Complexity: 2/10.** Move ambient environment resolution to the existing transcript factory and verify storage precedence with real SQLite fixtures.

## Goal

An explicitly supplied home controls a direct transcript reader's database even when the surrounding environment sets an OpenCode data home, while real launches still follow the workspace-private or ambient launch location.

## Approach

The reader derives its default storage from its supplied home and accepts a separate explicit data-home override. Only the factory reads the ambient environment, after trying the workspace-private data home. This keeps direct reader construction deterministic and makes the launch location an explicit dependency. Preserve local and remote transcript behavior and existing schema compatibility.

## Implementation steps

1. Update `src/harness/transcript/opencode.ts` and `src/harness/transcript/sources.ts`. Add an explicit-home regression in `src/harness/transcript/opencode.test.ts`, keeping its fixtures under the project directory, and a competing-workspace-and-ambient database test in `src/harness/transcript/sources.test.ts`. Run `./scripts/run.mjs check-diff`.
2. Clarify data-location precedence in `product/specs/harness-recording.md`. Existing documentation describes no changed behavior and needs no update. Run `./scripts/run.mjs check-diff`.
3. Promote this plan, remove the last entry, restore `product/backlog/pull-request.md` to the exact master comment-and-heading skeleton, verify, and push to PR #1671. Leave the PR open with its title and description unchanged.

## Tests

- A direct reader constructed with a fake home reads that home's SQLite session even when ambient storage contains a different matching session.
- A factory reader uses workspace-private storage when both workspace and ambient databases contain matching sessions.
- Existing ambient-only, local-workspace, remote-workspace, flat-schema, and JSON-schema transcript cases remain passing.

## Out of scope

Database schema changes, transcript rendering, credential provisioning or refresh, other harness storage, and new documentation. No code comments.
