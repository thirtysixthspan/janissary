# Give connections-list rows a unique owner-aware identity

**Complexity: 3/10** — widen one client-side identity helper and use it for the rendered key, with focused unit and component cases; no server, protocol, ordering, or two-click behavior changes.

## Goal

Resolve PR #1916's recorded finding: "Functionality: give connections-list rows a unique identity that includes their owner so duplicate shell rows cannot collide." Two tabs can both hold a shell connection, producing list rows with the same `type`, `kind`, and `id`. The client builds each row's React key and its two-click confirmation identity from those three fields only, so the two rows collide: React can reuse one row's DOM for the other, and a confirmation captured on one row can open the other when a same-length reorder or replacement leaves the row list unchanged.

## Approach and evidence

`connectionRowIdentity` serializes only `[row.type, row.kind, row.id]` (`web/src/plugins/connections/connection-list-keys.ts:6`–`:8`). `connectionListOrder` maps every row through that identity (`:10`–`:12`), and `connectionClickSelection` compares a stored `{ identity, order }` confirmation against the current row and list (`:27`–`:38`). `ConnectionList.tsx` rebuilds the same three fields by hand for the React key (`web/src/plugins/connections/ConnectionList.tsx:71`) and clears a pending confirmation whenever the computed order changes (`:37`).

Every row already carries a stable `ownerLabel`: live rows carry their owning tab's label or `global`, and record rows carry the original owner captured with the record. Adding it to `connectionRowIdentity` makes a row's identity owner-aware, so two same-id shell rows are distinct. Because `connectionListOrder` is built from that identity, the order string now changes when owners change, and `ConnectionList`'s existing effect discards a stale confirmation. The JSX key uses the same helper, so keys are unique for the same reason. Record rows remain distinguished by their UUID (`id`) and SQLite rows by their unique database id, exactly as today.

The fix is identity plumbing only. `ConnectionList` continues to render `rows` in the order the server supplies, and the controller receives the same rows; there is no client sort, merge, or deduplication.

## Implementation steps

1. In `web/src/plugins/connections/connection-list-keys.ts`, include `row.ownerLabel` in the tuple `connectionRowIdentity` serializes. `connectionListOrder` keeps mapping rows through that helper, so the owner is part of the order without a second tuple.
2. In `web/src/plugins/connections/ConnectionList.tsx`, import `connectionRowIdentity` and use it for the row's `key` instead of the local `${row.type}:${row.kind}:${row.id}` template. Leave row order, selection, click handling, keyboard handling, and the confirmation-clearing effect unchanged.
3. Extend `web/src/plugins/connections/connection-list-keys.test.ts` with the duplicate-owner identity and stale-confirmation cases described under Tests.
4. Extend `web/src/plugins/connections/ConnectionList.test.tsx` with the duplicate-shell-row rendering, same-length reorder, and same-length replacement cases described under Tests.
5. In `product/specs/connections-tab.md`, state that a row's identity includes its owning tab, so two tabs' same kind and id rows stay distinct, and that a pending second-click confirmation is discarded when rows are reordered or replaced even at the same length.
6. Run `$janissary/scripts/run.mjs check-diff`, then the focused client suites for the two changed test files.
7. Promote this plan to `product/plans/complete/` and remove only the resolved entry from `product/backlog/pull-request.md`, preserving every other entry byte-for-byte.

## Tests

- `connection-list-keys.test.ts`: two live shell rows sharing `type`, `kind`, and `id` but carrying different `ownerLabel` values have different `connectionRowIdentity` strings and different `connectionListOrder` strings; two fully identical rows still compare equal.
- `connection-list-keys.test.ts`: a confirmation captured on the first of two same-id shell rows does not open the second row, whether the second row is at another index, is reordered to the confirmed index at the same length, or replaces a different row while the length stays the same; a second click on the same owner-aware row still opens it.
- `ConnectionList.test.tsx`: two live shell rows with the same id and different owners render without React's duplicate-key warning, and one click on the first row followed by a click on the second opens neither row; a second click on the second row opens only the second owner.
- `ConnectionList.test.tsx`: after a click on the first row, a same-length reorder that puts the second row at that index leaves the click unopened, and a same-length replacement of the other row with a third same-id owner likewise does not open the replacement or the confirmed row; a fresh second click then opens the clicked row under its own owner.

## Out of scope

- Server row ordering, the connections topic payload, intent owners, and ACP/SQLite record lookup.
- Sorting, merging, or deduplicating rows on the client; the list keeps the server's supplied order.
- The two-click timing rule, keyboard navigation, action buttons, and delete confirmation behavior.
- The other backlog entries, including keyboard activation of row controls, caller popup incarnation matching, history viewport restoration, stale reference cleanup, the pull request description, and the manual acceptance ledger.
- New user documentation: `documentation/user-documentation/command-bar/connections.md` describes the visible second-click rule, which is unchanged; row identity is not a documented surface.
- The pull request title, body, and history.

## Completion

- Added `ownerLabel` to `connectionRowIdentity`, so `connectionListOrder` now changes with owners, and built the row's React key from that same helper. Server-supplied row order, record UUIDs, SQLite ids, and the two-click flow are unchanged.
- Added six cases across the two client test files: duplicate shell rows have distinct identities and order, a stale or same-length-reordered confirmation cannot open the other owner's row, and a same-length replacement discards the confirmed row. All six fail against the old identity and pass with the fix.
- Focused client suites passed with 19 tests across `connection-list-keys.test.ts` and `ConnectionList.test.tsx`; `$janissary/scripts/run.mjs check-diff` passed lint, typecheck, and web tests.
- Updated `product/specs/connections-tab.md` for owner-aware row identity and discarded confirmations on reorder or replacement.
- No help or user-documentation change: the second-click rule the guide describes is unchanged.
- Removed only the resolved backlog entry, leaving six entries unchanged.
