# Derive the metadata-row detach control's provisioning state from the live channel

**Complexity: 4/10** — one optional wire field beside an existing one, filled in the same place, and the client control reading it from the view instead of a per-call-site boolean. Five call sites collapse to one source; no protocol plumbing beyond the field and no new server module.

## Goal

Per the PR backlog entry: "Derive the metadata-row detach control's provisioning state from the live channel, which today is guessed from busy-and-cwd-less on the client."

`AgentTabBody` (and `InactiveAgentTabBody`) pass `current.busy && current.cwd === undefined` as the control's provisioning signal, so a remote agent tab is treated as "still provisioning" whenever it has a command in flight with no working directory recorded — a state post-provisioning drifts into on every busy cwd-less stretch — and the detach control is disabled on exactly the live session a user is trying to park. `HarnessTab` passes `harness.status === 'provisioning'` (a genuinely different fact for a local harness) and `ShellTab` passes `false` unconditionally, so the shell-tab path has no provisioning signal at all.

**Verified starting facts.** The same test `detachRemoteEntry` refuses on (`src/remote/reattach.ts:155`) is `entry.workspaceDir === undefined` — the channel's own fact, and it is already on the tab view's path in `RemoteManager.workspaceOf`, which `buildTabViews` passes `buildTabView` for the workspace prefix (`src/tab/view.ts:25,47`). The `reconnecting` precedent (`src/protocol/tab.ts:28`, filled at `view.ts:72`) is exactly the shape to mirror: view-only, present only when true, resolved server-side beside the other recovery-ish facts.

## Approach

**Resolve provisioning like reconnecting already is — server-side, onto `RemoteTargetView`, read by the control.**

- `RemoteTargetView` in `src/protocol/tab.ts` gains optional `provisioning`, present only when the channel has no workspace directory — the same test `detachRemoteEntry` applies before refusing the action. Its doc comment is extended to explain why both recovery-ish facts are resolved server-side rather than stored on the tab: neither belongs on what `profile save` and `--relaunch` persist, and a copy on the tab can outlive the state it copied.
- `buildTabView` in `src/tab/view.ts` fills it beside the `reconnectingOf` read, from the same `workspaceOf` lookup the workspace prefix already uses. `buildTabViews` needs no change — it already passes that lookup in.
- `remoteSessionControl` in `web/src/shared/remote-session-control.ts` drops its fourth parameter and reads provisioning from `remote.provisioning` itself — the whole target is already passed in so this can be the only place that reads it.
- The call sites — `AgentTabBody`, `InactiveAgentTabBody`, `HarnessTab` (`harness.status === 'provisioning'`), and `ShellTab` (`false` unconditionally) — all collapse to the three-argument call. The harness tab's local-provisioning banner and PTY handling are untouched: only the remote control's state source moves.

## Implementation steps

1. `src/protocol/tab.ts`: add `provisioning?: boolean` to `RemoteTargetView`, extend the doc comment.
2. `src/tab/view.ts`: fill it from the existing `workspaceOf` lookup beside the `reconnecting` spread.
3. `web/src/shared/remote-session-control.ts`: drop the parameter; `stateOf` reads `remote.provisioning === true`.
4. Drop the fourth argument at all four call sites.

## Out of scope

- `detachRemoteEntry` and `RemoteManager` themselves — the refusal test is read, not changed.
- `HarnessView`'s `status` field and what the harness tab shows outside the remote control.
- The `reattach` verb's states — `reconnecting` already resolves server-side.

## Tests

- `src/tab/view.test.ts` (extend): a remote tab whose channel has no workspace gains `remote.provisioning: true`; one whose workspace landed does not carry the flag; a non-remote tab never carries it — even with a local `workspaceDir` present.
- Web regression, kept passing by construction: `web/src/harness/HarnessTab.test.tsx`'s provisioning cases do not render the remote control (`remote` undefined), and `AgentTabMeta`'s own control cases construct the control object directly — neither pins the removed parameter. Verified against the wired call-site signature rather than by hand.
