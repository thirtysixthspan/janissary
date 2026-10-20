# Search: a failed join that falls back to the launch directory searches nothing

Complexity: 2/10

## Goal

When a route's remote join fails and the search tab's previous remote scope cannot be rejoined either, the tab falls back to the launch directory. That fallback must follow the rule every failed join follows: search nothing, not even a phrase the route carried, and restart only a scan the failed route interrupted.

## Approach

`SearchSession.rescope` answered `moved` for the fallback, so `open` searched the route's phrase or reran the existing query in the launch directory. Make `rescope` apply the fallback scope and host as before, then — when the join failed — clear the rows (`rows: []`, `state: 'done'`, `message: ''`), publish, and return `join-failed`, so `open` takes its join-failed branch and reruns only an interrupted scan.

## Implementation steps

1. In `src/plugins/search/session.ts`, return `join-failed` from the moved branch of `rescope` when `entry.joinFailed`, after clearing and publishing the rows.

## Tests

- `src/plugins/search/activate.test.ts`: extend "falls back to launch when the previous remote scope cannot be rejoined" so the first search settles with a row, then a route carrying a phrase fails; assert no local or remote listing is requested and the tab shows `$root` with no rows, its old query kept.
- Add a case where a scan is still running in the old remote scope when the failed route arrives; assert it restarts in the launch directory and settles with that directory's results.

## Spec

`product/specs/search-tab.md`: the fallback clears the unreachable workspace's results without searching the launch directory.

## Out of scope

- Any extra notice for the scope change beyond the existing "no longer available" line.
- Changes to `src/plugins/search/scope-ride.ts`.
