# Remove stale connection and ACP panel references

**Complexity: 2/10** — two comment corrections and one behavior-spec sentence; no runtime, test, command-grammar, or documentation change.

## Goal

Readers tracing connection close behavior or the `browser` parser currently follow paths that no longer exist: `ConnectionManager.run` and `src/connection/parsing.ts`. The ACP spec also still calls the shell's error output a `response entry` after API v3 removed the response panel. Correct all three references so they name the code and behavior that are actually present.

## Approach

- `src/connection/close.ts` comments that every kind but `browser` closes synchronously through `closeConnection`; the asynchronous browser close runs from `ConnectionManager.closeTarget`, reached through the connections plugin command.
- `src/browser/command.ts` mirrors the connections parser, which now lives in `src/plugins/connections/parse.ts` as `parseConnectionsCommand`. The database parser reference stays unchanged.
- `product/specs/acp.md` records prompt errors as `ACP error: <message>` in the settled shell background reply and in the record's prompt block, matching `product/specs/acp-records.md` and the settlement path in `src/acp/run-prompt.ts`.

Nothing observable changes, so no test, command grammar, or user-documentation update is required. Completed plans are historical records and stay untouched.

## Implementation steps

1. Edit the browser-close comment in `src/connection/close.ts` to name `ConnectionManager.closeTarget` and the connections plugin command.
2. Edit the parser comment in `src/browser/command.ts` to name `parseConnectionsCommand` and `src/plugins/connections/parse.ts`.
3. Replace the stale `response entry` sentence in `product/specs/acp.md` with the settled shell background reply and the record's prompt block.
4. Run `$janissary/scripts/run.mjs check-diff` and the documentation assertions.
5. Promote this plan to `product/plans/complete/` and remove only the resolved entry from `product/backlog/pull-request.md`, preserving every other entry.

## Tests

None — comments and prose only. The existing `src/connection/close.test.ts`, `src/plugins/connections/command.test.ts`, and ACP settlement tests pin the described behavior unchanged. `check-diff` is the gate, with the documentation assertions run separately.

## Out of scope

- Application behavior, tests, CSS, protocol, or command grammar.
- `help/` and `documentation/user-documentation/`, which already describe the reply and record without a response panel.
- Historical plans under `product/plans/complete/`.
- Other backlog entries and the pull request's title or body.
- Merging, closing, or rewriting the pull request's history.
