# Bind live connection row actions to their owner

**Complexity: 5/10** — one additive field threaded through the plugin's intent contract, activation, lookup, and client controller, with tests at each layer and two small spec corrections; the topic already validates the owner, and record UUID and `open-record` resolution stay unchanged.

## Goal

Resolve PR #1916's recorded finding: "Functionality: bind each live connection row's open, close, and lookup to the row's owning tab, not the first row with the same kind and id." Two tabs can both hold a shell connection, producing list rows with the same kind and id. The list sends only kind and id, and both the plugin intent resolver and lookup select the first matching row, so acting on the second row opens or closes the first tab.

## Approach and evidence

`LiveConnectionRow` already carries `ownerLabel` (`src/plugins/connections/shared.ts:27`–`:36`), and the topic action already validates an action's `ownerLabel` against the current rows before focusing or closing (`src/plugins/connections-topic-actions.ts:49`–`:61`). The break is upstream: the client drops the owner when sending `open`/`close` (`web/src/plugins/connections/useConnectionsController.ts:8`–`:18`), and the activation resolver selects the first row by kind and id (`src/plugins/connections/activate.ts:6`–`:8`, `:53`–`:57`), so it forwards whatever owner that first row carries. Lookup has the same first-match rule (`src/plugins/connections/lookup.ts:20`–`:22`, `:59`–`:64`) even though it already reads the invoking tab for the ACP reference branch (`:44`, `:52`–`:58`).

Carry the owner from the row the user acted on:

- Widen the `open`/`close` intent payload to `{ kind, id, ownerLabel }` and replace the exact-shape guard with one that requires all three (`shared.ts`).
- Send the controller row's `ownerLabel` for both intents; `ConnectionList.tsx` already hands the whole row to the controller, so no behavior change is needed there beyond test expectations.
- In `activate.ts`, resolve `open`/`close` targets by kind, id, and owner against current topic data, preserving current-row validation: an owner no longer present is rejected before any topic action. Keep `open-record` id-only and keep record actions on their current id/kind path.
- In `lookup.ts`, prefer the invoking tab's own live row for a `<kind>:<id>` target, then fall back to the first matching row as today so lookups from unrelated tabs and global SQLite rows still work.

The command grammar, `connections close` notifications, and the topic's own owner check stay untouched.

## Implementation steps

1. In `src/plugins/connections/shared.ts`, change the `open`/`close` `ConnectionsIntent` payload to include `ownerLabel: string`, and replace `isKindIdIntent` with an exact three-key `isKindIdOwnerIntent` guard requiring a known kind, string id, and string owner.
2. In `src/plugins/connections/activate.ts`, resolve `open`/`close` payloads against current topic rows by kind, id, and owner, rejecting a missing or invented owner with the existing `invalid <intent> payload` rejection. Leave `rowForId` and `open-record` unchanged.
3. In `web/src/plugins/connections/useConnectionsController.ts`, send `ownerLabel: row.ownerLabel` with the `open` and `close` intents. `ConnectionList.tsx` already passes rows to the controller; update its tests only.
4. In `src/plugins/connections/lookup.ts`, make live-target resolution prefer a row whose `ownerLabel` equals the invoking tab's label, falling back to the first kind/id match when the invoking tab has none.
5. Update `src/plugins/connections/shared.test.ts`, `activate.test.ts`, `command.test.ts`, `lookup.test.ts`, `web/src/plugins/connections/ConnectionList.test.tsx`, `src/plugins/connections-topic.test.ts`, and `src/controller.test.ts` as described under Tests.
6. In `product/specs/connection.md`, extend the lookup-order sentence so the live `<kind>:<id>` step prefers the invoking tab's own row when several tabs hold the same connection.
7. In `product/specs/connections-tab.md`, state that a row action is bound to that row's owning tab, so two tabs with the same kind and id act on their own rows and an owner that no longer matches does nothing.
8. Run `$janissary/scripts/run.mjs check-diff` after the source and test changes, then the focused server and client suites.
9. Promote this plan to `product/plans/complete/` and remove only the resolved entry from `product/backlog/pull-request.md`, preserving every other entry byte-for-byte.

## Tests

- `shared.test.ts`: accepts an exact kind/id/owner intent and rejects a missing owner, an extra key, and an unknown kind.
- `activate.test.ts`: with two live rows sharing a shell kind and id, an intent naming the second owner opens and closes only the second row; an invented owner rejects without a topic action; existing `open-record` and malformed-payload cases still hold.
- `command.test.ts`: a lookup from the second tab's origin prefers its own shell row; an unrelated origin still falls back to the first row; command grammar and `closeCommand` forwarding stay unchanged.
- `lookup.test.ts`: two live shell rows with the same id resolve to the invoking tab's row, and an invoking tab without a matching row falls back to the first row.
- `ConnectionList.test.tsx`: two live shell rows with the same id send the second row's owner for open and close, never the first row's owner; existing expectations include `ownerLabel`.
- `connections-topic.test.ts`: the fixture's two tabs already expose the same shell id; opening and closing the second owner focuses and closes the second tab, while the first tab's actions remain owner-bound.
- `src/controller.test.ts`: the end-to-end SQLite intent test sends and validates the current row owner; add a two-tab same-shell case through `pluginIntent` if the controller fixture can express it without new production seams.

## Out of scope

- The command grammar, `connections close` target parsing, completion, and its notifications.
- The topic's owner validation and `open-record`, record UUID, and complete-title lookup precedence.
- React row keys, selection identity, and confirmation behavior (other backlog entries).
- Pull request title or body changes, other backlog entries, and merge or history rewriting.
- New user documentation: the guides still describe focusing the owning tab, and the duplicate-owner preference is a specification nuance rather than a previously documented behavior.

## Completion

- Widened the `open`/`close` intent payload and exact-shape guard to require `ownerLabel`, made activation resolve the target by kind, id, and owner against current topic data, forwarded the owner from the client controller, and made lookup prefer the invoking tab's live row before the first kind/id match.
- Added five cases: duplicate-shell open/close ownership and invented-owner rejection in `activate.test.ts`, invoking-tab lookup preference in `command.test.ts` and `lookup.test.ts`, duplicate-row intents in `ConnectionList.test.tsx`, and two-tab `pluginIntent` ownership in `controller.test.ts`; extended `shared.test.ts` guard assertions and the existing two-tab shell topic action case.
- Focused suites passed: `shared.test.ts`, `activate.test.ts`, `command.test.ts`, `lookup.test.ts`, and `connections-topic.test.ts` (53 tests), `ConnectionList.test.tsx` (9 tests), and the two related `controller.test.ts` cases.
- `$janissary/scripts/run.mjs check-diff` passed lint, typecheck, server tests, and web tests.
- Updated `product/specs/connection.md` for the lookup preference and `product/specs/connections-tab.md` for owner-bound row actions.
- Removed only the resolved backlog entry, leaving seven entries unchanged.
