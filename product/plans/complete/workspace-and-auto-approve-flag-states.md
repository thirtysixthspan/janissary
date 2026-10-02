# Swap the provisioning spinner for a green workspace flag, and light auto-approve once it acts

**Complexity: 3/10** — two flag-derivation tweaks in `buildTabView`, two display entries, and one tab mark set from the two places an auto-approval is already reported (local approver, remote gate event). No new component, no protocol change.

## Goal

Review feedback on the provisioning indicator: while a workspace is being provisioned, the workspace icon should be hidden, and once provisioned the spinning icon is replaced by the workspace icon. The workspace icon should be the same green as the browser icon when a browser is in use. The auto-approve icon should go green once a permission prompt is auto-approved.

## Design decisions

- **Spinner stands in for the workspace flag.** While `provisioningFlag` yields `provisioning`, `buildTabView` omits `workspaced`, so the spinner occupies the workspace flag's slot and the box replaces it on the same update that ends provisioning. Every provisioning condition already implies a workspace (a `-w` clone, a remote tab, or a local in-flight clone), so nothing else changes. A failed provisioning drops the spinner and shows the box, since the tab still has a workspace until it closes.
- **The metadata row's button titles still say "in this workspace" while provisioning.** `AgentTabMeta` derives `workspaced` from the flag list; it now treats `provisioning` as workspaced too, so hiding the box does not change the file-navigator and ➕ tooltips.
- **Workspace flag is green.** The `workspaced` display entry gains the existing `tab-flag--active` class — the class the in-use browser flag already uses — so it is the same green. Because the box only shows once provisioning has ended, it is green whenever it is visible.
- **Auto-approve turns green after its first approval.** A new `autoApproved` mark on `HarnessView` (beside `browserRunning`) is set the first time auto-approve injects an approval, and stays for the tab's life. `buildTabView` sends `autoApproved` instead of `autoApprove` once it is set; the client renders it with the same bolt icon, the `tab-flag--active` class, and the tooltip "Auto-permitting (a prompt was approved)". A stand-down ("could not clear") does not light it.
- **One reporter, two callers.** `reportAutoApproved(managers, label)` in `src/harness/auto-approved.ts` mirrors `reportBrowserStarted`: resolves the harness tab, sets the mark, emits a `dirty` state. The local `buildAutoApprover` calls it from its `approve` callback. The remote `onGateEvent` calls it when the frame carries a capture — the far-side approver attaches a capture only to an approval, never to a stand-down — so no protocol change is needed. A gate event replayed after reattaching lights it too, since an approval did happen.

## Proposed changes

1. `src/tab/types.ts` — add `autoApproved?: boolean` to `HarnessView` with a comment.
2. `src/harness/auto-approved.ts` — new `reportAutoApproved(managers, label)`.
3. `src/harness/auto-approve-wire.ts` — call it from `approve`.
4. `src/remote/pty-session.ts` — call it from `onGateEvent` when `capture !== undefined`.
5. `src/tab/view.ts` — omit `workspaced` while provisioning; add an `autoApproveFlag` helper returning `autoApproved` or `autoApprove`.
6. `src/protocol/tab.ts` — extend the `flags` comment.
7. `web/src/shared/tab/flag-display.ts` — `workspaced` gets `tab-flag--active`; add `autoApproved`.
8. `web/src/shared/AgentTabMeta.tsx` — `workspaced` true for `provisioning` too.
9. `product/specs/tabs.md`, `product/specs/harness.md` — describe the swap, the green workspace flag, and the lit auto-approve flag.
10. `documentation/user-documentation/getting-started/tabs.md`, `advanced-agents/harness.md`, `advanced-agents/workspaced-agent.md` — update the sentences that describe these flags.

## Tests

`src/tab/view.test.ts`:

- provisioning tabs report `['provisioning']` with no `workspaced`; once provisioned they report `['workspaced']`
- a harness provisioning failure reports `['workspaced']`
- an auto-approving tab reports `autoApprove` until `harness.autoApproved` is set, then `autoApproved`

`src/harness/auto-approved.test.ts`:

- marks the named harness tab and emits a `dirty` state; does nothing for a tab no longer open

`src/remote/pty-session.test.ts`:

- a gate-event with a capture marks the tab auto-approved; one without (a stand-down) does not

`web/src/shared/AgentTabMeta.test.tsx`:

- the workspaced flag carries the green `tab-flag--active` class
- the `autoApproved` flag renders the bolt with the green class and its tooltip
- the file-navigator tooltip still says "in this workspace" while only `provisioning` is sent

## Out of scope

- Clearing the auto-approved mark (e.g. when the approver stands down) — the request is "once approved".
- Lighting auto-approve for remote tabs rebuilt by an attach that replays no gate events.
- Persisting the mark across `--relaunch`; auto-approval itself is never persisted.
