# Cover the commands payload validator and mapping

Issue: `src/plugins/commands/payload.ts` is the only new server module whose mapping and validation edge cases are mostly exercised through `activate.test.ts`. Its existing `payload.test.ts` covers only one label branch, so the accept/reject fields of `isCommandsData` and the parent canonicalization rules of `toPayload` are unpinned.

Complexity rating: 2/10 — one test file, a shared row fixture helper, no production change.

## Goal

Pin the current `isCommandsData` accept/reject contract and the `toPayload` mapping rules without changing production behavior. The new cases must keep the existing `activate.test.ts` mapping assertions green.

## Approach

Extend the existing `src/plugins/commands/payload.test.ts` rather than adding a sibling file. Keep its ask/tell/search form rows and native child fixture, broaden it to cover every label branch and the parent drop/keep rules, and add an `isCommandsData` describe beside the existing `toPayload` describe. Use the existing `row` helper so each case states only the field under test.

## Implementation steps

1. Expand the fixture in `src/plugins/commands/payload.test.ts` with the ask, tell, and search form rows plus a native child row, including a row whose parent matches a canonical name, one whose parent matches an alias, one whose parent matches a fixed form, one with an unmatched parent, and one whose canonicalized parent equals its own name.
2. Add an `isCommandsData` describe: accept a complete snapshot and an empty command list; reject `null`, arrays, and missing or mistyped `commands`, `name`, `kind`, `aliases`, `forms`, `parent`, `nativeTool`, `enabled`, `agentAccess`, `effectiveEnabled`, `effectiveAgentAccess`, `source`, `path`, and `problem`.
3. Add `toPayload` assertions for row order and labels (name in forms, first form otherwise, and a first form naming another canonical row), parent canonicalized through a name, alias, and form, an unmatched parent kept, a parent equal to the row's name dropped, and optional `nativeTool`, `problem`, `source`, and `path` preserved.
4. Run `$janissary/scripts/run.mjs check-diff`.
5. Remove the resolved entry from `product/backlog/pull-request.md`, preserving the other entries.

## Tests

- `src/plugins/commands/payload.test.ts`: `isCommandsData` accepts a complete snapshot and an empty command list, and rejects each malformed field listed above.
- Same file: `toPayload` maps rows in order with the expected labels, canonicalizes parents through name, alias, and form, keeps an unmatched parent, drops a parent equal to the row's name, and preserves `nativeTool`, `problem`, `source`, and `path`.
- Existing `src/plugins/commands/activate.test.ts` mapping assertions continue to pass unchanged.

## Specs and docs

- `product/specs/application-commands.md` already describes the settings snapshot and command rows, and this change adds only test coverage, so no spec change is needed.
- No help or user-documentation change: user-visible behavior is unchanged.

## Out of scope

- Any production change to `src/plugins/commands/payload.ts` or `src/plugins/commands/shared.ts`.
- Changes to `src/plugins/commands/activate.test.ts` or `shared.test.ts`.
- Any other backlog entry.
