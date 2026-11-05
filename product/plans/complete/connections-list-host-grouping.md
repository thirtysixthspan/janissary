# Group the connections list by host, open before closed

Issue: connections should be ground by host then open connections should show above closed connections within the host groups then the values are sorted by last activity.

Complexity rating: 3/10

## Goal

The connections list is one flat list ordered only by most recent activity, so local and remote rows interleave and a closed record that changed recently sits above a live connection. Order the rows in three levels instead: by host first, then open rows above closed rows within each host, then by most recent activity within each of those.

## Approach

Row order is a presentation decision the server already makes (architecture principle 1): `composeConnectionsTopicData` in `src/plugins/connections-topic-rows.ts` sorts the topic rows, and the list renders them in the order they arrive. Only that comparator changes. The client, the wire shape, and the shared contract stay as they are.

The comparator orders by four keys in turn:

1. **Host.** `Local` comes first, because it is where every SQLite row and every tab without a remote lives, and then every other host in case-insensitive alphabetical order. A fixed order keeps each group in one place as activity changes. Ordering groups by their newest activity was rejected because a whole block of rows would jump each time a quiet host became busy.
2. **Open before closed.** A row is closed when it is a record whose status is `Closed`, `Completed`, `Failed`, or `Terminated`. Every live row (`Open`) and every `Running` or `Idle` record counts as open.
3. **Most recent activity**, descending on the existing `orderingTimestamp`, unchanged.
4. **Ties** break by kind and then id, as today.

Lookups that read the rows (`src/plugins/connections/lookup.ts`) match on id, owner, or title and sort title matches by update time themselves, so they are unaffected. The one fallback that takes the first matching live row when no row belongs to the typing tab now takes the first in host order rather than the most recently active; that only arises when two other tabs expose the same `<kind>:<id>`, and either pick is a valid target.

## Implementation steps

1. In `src/plugins/connections-topic-rows.ts`, replace the activity-only sort with a comparator ordering by host (`Local` first, then case-insensitive alphabetical), then open before closed, then descending `orderingTimestamp`, then kind and id.

## Tests

- `src/plugins/connections-topic-rows.test.ts`: update the composition test's expected order so the closed agent record follows every open local row.
- `src/plugins/connections-topic-rows.test.ts`: rows from a remote tab, an ssh tab, and a record captured on another host group after the `Local` rows in alphabetical host order, case-insensitively, whatever their activity.
- `src/plugins/connections-topic-rows.test.ts`: within one host, a closed record with the newest activity sorts below an older live row and an older `Idle` record, and each of the open and closed bands is ordered by descending activity.

## Out of scope

- Visual group headings or separators in the list; the order alone groups the rows.
- The connections popup in shell, editor, and harness tabs, and the `connections list` command output, which have their own ordering.
- The remaining pull-request backlog entries (expanded tool calls and pretty-printed JSON, last activity for every connection type, a UUID for every connection type, the focus button in the connection metadata row, and the table header wording).

## Specs and docs

- `product/specs/connections-tab.md`: the list is grouped by host, `Local` first and then other hosts alphabetically, with open rows above closed rows in each host and most recent activity first within each.
- `product/specs/tab-plugins.md`: the connections slice's row-order sentence names the host and open-before-closed keys ahead of activity.
- `documentation/developer-documentation/tab-plugins.md`: the same correction to the connections slice's ordering sentence.
- `documentation/user-documentation/command-bar/connections.md`: the table's ordering sentence describes the host grouping and open-before-closed order.
