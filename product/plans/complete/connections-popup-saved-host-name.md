# Show the saved host name in the connections popup

**Complexity: 2/10** — ~8 added lines in two production files, 3 behavioral requirements and 4 scenarios, no new modules or wire types (p=4.097).

## Summary

Per the backlog: "update the connections popup to show hosts name instead of destinations, for example: ssh:thecandykingdom instead of ssh:anonymouscoward@10.27.1.94".

An ssh tab opened from a saved host already carries the name it was stored under in `tab.harness.hostName` (set by `SshManager.open` from `buildSavedSshInvocation`). The connections popup ignores it: `sshEntry` in `src/connection/catalog.ts` builds the row text from `harness.destination`, which for a saved host is the real `[user@]host` (e.g. `anonymouscoward@10.27.1.94`). The popup therefore shows `ssh:anonymouscoward@10.27.1.94` instead of `ssh:thecandykingdom`. This change makes the popup use the saved name when one exists.

## Goal

For an ssh tab launched from a saved host, the connections popup's ssh row reads `ssh:<saved name>` instead of the concrete destination. Literal `ssh <destination>` tabs keep showing the destination, and every other surface that needs the real address — `connections list`'s parenthetical, `connections close` matching, tab labels, and the connections tab's data — is unchanged.

## Approach

`ConnectionEntry.display` is the text the popup draws: `ConnectionManager.connectionsFor` maps it into `tab.connections`, and `StatusPanels` renders `row.text` directly. `ConnectionEntry.detail` is the parenthetical `connections list` appends and is separate. So only the `display` of ssh entries needs to change; `id`, `detail`, and `scope` stay exactly as they are.

`sshEntry` builds the ssh entry for both ssh harness tabs and remote tabs. Only an ssh harness tab can be launched from a saved host, and only it has `harness.hostName`. The entry's display prefix becomes `harness.hostName` when the tab is an ssh tab with a saved name, and the destination otherwise. This keeps remote tabs (`ssh:<address>` for their transport) and literal ssh tabs untouched. The saved name belongs to the launch, so it stays on the row even if the saved catalog is later edited — no catalog re-read is introduced.

## Implementation steps

1. In `src/connection/catalog.ts`, update `sshEntry` so `display` uses `tab.harness.hostName` when the tab is an ssh tab and that field is present, falling back to `destination`. Keep `id: tab.label`, `detail: destination`, and `scope` unchanged, and update the leading comment to describe the new display rule.
2. In `src/tab/types.ts`, update the `HarnessView.hostName` comment, which currently states that the panel keeps showing `ssh:<destination>` and not the saved name.

## Tests

`src/connection/catalog.test.ts` (mirror the existing `sshTab` helper and `toMatchObject` assertion style):

- Extend the `sshTab` helper to optionally set `harness.hostName`.
- An ssh tab opened from a saved host produces an ssh entry whose `display` is `ssh:thecandykingdom` while `id` stays the tab label and `detail` stays the real destination (`anonymouscoward@10.27.1.94`).
- Another tab's saved-host ssh connection appears in the issuing tab's catalog with the saved name in its `display` and `scope: 'global'`.
- The existing literal-ssh assertion (`ssh:host.example.com` with `detail: 'host.example.com'`) continues to pass, confirming unnamed launches are unchanged.

## Specs and docs

- `product/specs/ssh-tab.md`: the connections panel shows `ssh:<saved name>` for a saved-host launch; the real destination stays for `connections list`, close, and identity.
- `product/specs/connection.md`: the connection window's ssh row uses the saved name when the launch had one.
- `help/ssh.md`: the saved-host note now says the panel shows the saved name instead of the real destination.
- `documentation/user-documentation/command-bar/connections.md`: the over-ssh-tab panel sentence names the saved host.

## Out of scope

- Remote tabs' `ssh:<address>` transport rows; their `RemoteTarget` carries no saved name.
- `connections list` formatting, `connections close` matching, tab labels, and the close completion candidates.
- Adding the real destination as a tooltip on the popup row; the popup has no tooltip today.
- The connections tab plugin's grouping, ordering, and columns beyond the shared `display` text it already reads.
