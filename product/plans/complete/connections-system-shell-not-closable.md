# System shell connection rows are not closable

Issue: shell connection for the system tab should not be closable. no button should show on that row.

Complexity rating: 3/10

## Goal

The connections list shows a **Close** control on every live row. The managed hidden `system` tab's shell is one of those rows, and closing it kills the PTY the system schedules and hooks run in. The user-facing close paths for that tab already refuse to destroy it (a user close only hides the tab), so the connections list should not offer a close for its shell either. Remove the Close control from the system tab's shell rows and refuse a close action that names one.

## Approach

Whether a row can be closed is a presentation decision, so the server makes it (architecture principle 1). `composeConnectionsTopicData` in `src/plugins/connections-topic-rows.ts` marks a live row `permanent: true` when its owning tab is the managed system shell (`tab.systemShell === true`) and its kind is `terminal` (the shell plugin's PTY) or `shell` (the tab's background shell process). Both are the system tab's shell; its ACP, browser, and other connections keep their Close.

The flag is optional and only ever `true`, matching the tab view's own `systemShell?: true`. It is added to `ConnectionsTopicLiveRow` in `src/protocol/connections.ts` and to `LiveConnectionRow` in the import-free shared contract `src/plugins/connections/shared.ts`, whose `isConnectionRow` guard accepts the field only when it is exactly `true`. Rows pass to the list payload unchanged, so no mapping is needed in `tabs.ts`. The protocol field and the server predicate each carry a one-line comment saying why the row has no close, matching the commented fields around them.

On the client, `canClose` in `web/src/plugins/connections/ConnectionRowActions.tsx` returns false for a live row marked permanent, so neither the table nor the docked rendering shows the button.

The server also refuses the action: `actOnLive` in `src/plugins/connections-topic-actions.ts` treats a `close` naming a permanent row as a no-op, the same way it treats a stale target, so a hand-sent intent cannot kill the system shell through the list. `connections close` typed as a command (`closeCommand`) is unchanged; it acts on the typing tab's own connections, and the hidden system tab has no command bar.

Rejected alternative: hiding the system tab's shell rows from the list entirely. The entry asks only that the row have no button, and the row is still useful for seeing and focusing the system shell.

## Implementation steps

1. Add `permanent?: true` to `ConnectionsTopicLiveRow` in `src/protocol/connections.ts` and to `LiveConnectionRow` in `src/plugins/connections/shared.ts`; validate it in `isConnectionRow`.
2. Set it in `liveTabRows` in `src/plugins/connections-topic-rows.ts` for `terminal` and `shell` rows owned by the managed system shell tab.
3. Make `actOnLive` in `src/plugins/connections-topic-actions.ts` skip `close` for a permanent row.
4. Make `canClose` in `web/src/plugins/connections/ConnectionRowActions.tsx` exclude permanent live rows.

## Tests

- `src/plugins/connections-topic-rows.test.ts`: the system shell tab's `terminal` and `shell` rows carry `permanent: true`; its other live rows, and an ordinary tab's `terminal` and `shell` rows, carry no `permanent` property.
- `src/plugins/connections-topic.test.ts`: a `close` naming the system shell tab's shell row calls no `closeTarget`, while `open` on it still focuses the tab, and a `close` for an ordinary tab's shell row still closes it.
- `src/plugins/connections/shared.test.ts`: a live row with `permanent: true` validates; one with `permanent: false` or a non-boolean is rejected.
- `web/src/plugins/connections/ConnectionList.test.tsx`: a permanent live row renders no Close control in the table or docked, while a non-permanent live row beside it still does; the permanent row still opens on a second click.

## Out of scope

- The connections popup in shell, editor, and harness tabs (`StatusPanels`), which has its own close rules.
- `connections close <kind>:<id>` typed as a command.
- The system tab's ACP, browser, ssh, and SQLite connections.
- The remaining pull-request backlog entries (ACP command echo in the shell, connection tab metadata bar).

## Specs and docs

- `product/specs/connections-tab.md`: a live row offers Close except the managed system tab's shell rows, which offer no list control, and a close naming one changes nothing.
- `documentation/user-documentation/command-bar/connections.md`: the live-row Close sentence notes that the system tab's shell has no Close.
