# Role aware ACP connection identity

**Complexity: 5/10** — carries role identity across live rows, stored records, protocol references, lookup, and close actions.

## Goal

Make ask and tell ACP sessions distinguishable on every live and retained connection surface, and route lookup, open, cancel, and close actions to the session that owns the record.

## Decisions and dependencies

- Depends on `role-keyed-acp-session-state.md` and `acp-prompt-isolation-and-role-orchestration.md`; durable records already carry optional role metadata.
- A live session id is `acp:<role>:<provider/model>`. A retained record's name and connection tab title are `acp:<role>:<tab name>` when the record has a role. Legacy records without a role keep their stored name.
- Extend tab-scoped `AcpRef` with its role so a connection popup row carries the role of its session and opening that row resolves the matching durable record. Update every producer and guard consistently; plugin capabilities that represent the legacy tab session explicitly use role `ask`.
- Close routing checks existing editor-persona and monitor matches first. `tell` and `tell:<…>` close tell; `ask`, `ask:<…>`, and every other id close ask, preserving catch-all behavior for a still-connecting ask session.
- The connection tab's **Close session** and **Cancel** act on the role stored on that record. Opening a live popup ref or record must resolve the matching role's record; owner checks must ensure a tell record cannot close or cancel ask. `openAcpTranscript` continues to snapshot the whole shared tab transcript regardless of the ref's role.
- `TabView.acp` continues to report the ask model because it has no client reader.

## Existing code to reuse

- `src/connection/catalog.ts` creates live ACP rows and refs; `src/connection/close.ts` routes close requests.
- `src/plugins/connections/shared.ts` provides `recordConnectionName`, used by list display, connection-tab title, and name lookup.
- `src/controller/connection-records.ts`, `src/plugins/connections-topic-actions.ts`, and `connections-topic-rows.ts` resolve and act on records owned by a tab.
- `src/protocol/tab.ts` defines `AcpRef`; its consumers include shell, harness, editor, plugin capabilities, and connection surfaces.
- `src/plugins/connections/lookup.ts` resolves retained record names.

## Proposed changes

- Add role to tab-scoped `AcpRef` and update its validation and construction sites across protocol, shell, editor, harness, and plugin capabilities.
- Emit one catalog entry per role session with the role-prefixed live name. Resolve record opening and owner checks using the ref's role.
- Update `recordConnectionName` to use optional record role and preserve old-name behavior when absent; make lookup match role-qualified new names and legacy stored names from records without role metadata, without changing title matching.
- Route record-tab open, cancel, and **Close session** actions to the role holding the record. Validate the role against the owning tab before acting. `connections close acp:tell` and `acp:tell:<…>` close tell; `acp:ask`, `acp:ask:<…>`, and any other id close ask. Preserve editor-persona and monitor checks before these routes, and report the actual closed name as `Closed connection acp:<role>:<provider/model>.`.
- Keep `TabView.acp` tied to ask, and update `product/specs/connection.md` and `product/specs/connections-tab.md` for role-qualified live/record names and actions.

## Tests

- Extend `src/connection/catalog.test.ts` and `close.test.ts` for both roles, tell matching, ask fallback, and reported session identity.
- Extend `src/plugins/connections/shared.test.ts` and `lookup.test.ts` for records with roles and legacy names without role metadata.
- Extend connection topic action/row and controller connection-record tests to ensure a tell record opens, cancels, and closes tell only.
- Update protocol and client producer tests for the role-bearing `AcpRef`.

## Verification

- Run `$janissary/scripts/run.mjs check-diff` after each implementation change and after tests.
- Confirm `connections list`, the connections tab and popup, record-tab titles, lookup, and close notifications show the same role-qualified identity.

## Out of scope

- Changing the shared transcript snapshot or the visible record title `ACP: <first prompt line>`.
- Changing monitor or editor-persona connection identity and policy.
- Updating user help or user documentation; the final documentation subplan owns those.
