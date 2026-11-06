# Group closed connections below every open connection in the connections tab

**Complexity: 2/10** — a one-line reordering of the sort keys in the connections topic composer, plus test and documentation updates. No new architecture, no wire shape change, and the client renders rows in the order the server sends them.

The connections tab groups rows by host first, and only within each host puts open rows before closed records. With several hosts, closed `Local` records sit above open rows on every other host, so closed connections are scattered through the list instead of forming one grouping at the bottom.

## Goal

Rows are sorted by connection status first: every open row (live rows and `Running` or `Idle` records) comes before every closed row (`Closed`, `Completed`, `Failed`, `Terminated`), so closed connections always form a separate grouping below the rest. Within the open grouping and within the closed grouping, rows keep today's order: by host (`Local` first, then other hosts alphabetically ignoring case), then most recent activity, then kind, then id.

## Approach

1. **`src/plugins/connections-topic-rows.ts`**: in `composeConnectionsTopicData`, compare `isClosedRow` before `compareHosts` in the `rows.sort` comparator. Everything else in the comparator stays the same.

## Implementation steps

1. Swap the first two sort keys in `composeConnectionsTopicData`.
2. Update `src/plugins/connections-topic-rows.test.ts`:
   - Change the host-grouping test so it checks host order within the open grouping, where the `alpha` record is open, and keeps the closed rows out of that check.
   - Add a test with a closed `Local` record and an open row on a remote host, asserting the open remote row comes before the closed `Local` record and that closed rows on several hosts keep the host order inside the closed grouping.
3. Run `$janissary/scripts/run.mjs check-diff`.

## Tests

- `src/plugins/connections-topic-rows.test.ts`: host grouping holds inside the open grouping, with `Local` first and other hosts alphabetical regardless of activity.
- `src/plugins/connections-topic-rows.test.ts`: a closed `Local` record sorts below an open row on a remote host, and closed rows on several hosts are ordered by host, then activity, within the closed grouping.
- The existing "open rows above closed rows" test keeps passing unchanged.

## Spec and documentation

- `product/specs/connections-tab.md`: the ordering paragraph says open rows come before closed rows across the whole list, and that each grouping is ordered by host and then activity.
- `product/specs/tab-plugins.md`: the connections slice ordering sentence matches.
- `help/connections.md` and `documentation/user-documentation/command-bar/connections.md` already describe the ordering, so they are updated in place.

## Out of scope

- A visible divider or heading between the open and closed groupings.
- `documentation/developer-documentation/tab-plugins.md`, which repeats the slice ordering but sits outside this task's editable documentation; it is left for a follow-up.
- Any change to the client list, keyboard navigation, or selection behavior.
