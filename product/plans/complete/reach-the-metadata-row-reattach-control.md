# Make the metadata row's reattach control reachable

Issue: the metadata row's reattach control is unreachable because no call site produces the reconnecting state.

Complexity rating: 4/10

## Goal

`remoteSessionControl` computes its state as `provisioning ? 'provisioning' : 'active'` and is the only producer of the prop. So `RemoteSessionButton`'s `reconnecting` branch, the `reattach` arm of `ControllerCore.remoteSession`, and `SessionsManager.reattachTab` are all unreachable from the running application — while decision 24, `product/specs/sessions-tab.md` ("detach while the session is healthy, reattach while its transport is being retried"), and the pull request body all say the control offers both verbs.

The one gesture that explains an unresponsive remote tab — press this to stop waiting out the backoff — is documented in a shipped spec and absent from the product. A user with a reconnecting tab is shown a detach control instead, and parks a session they were trying to recover. The component's own tests drive it with a hand-written `reconnecting` state, so the suite reports the behavior as covered.

`inFlight` is declared on `AgentTabMeta` and supplied by none of the four call sites, and by no test.

## Approach

**Derive the reconnecting state, do not copy it.** The reviewer's proposal is to set a flag wherever `RemoteManager` marks a lost transport and clear it on `accepted`, and its own stated risk is that the flag goes stale if the server forgets one of those points. That risk is avoidable: `buildTabViews` in `src/tab/view.ts` already has `managers`, and already resolves one live fact per tab that way — `workspaceOf` for the workspace prefix. A second resolver for the reconnect state reads `RemoteManager`'s own `reconnect.active` at the moment the view is built, so there is no second copy that can disagree with it and no marking step to forget.

`RemoteManager` gains `reconnectingOf(label)` beside `workspaceOf` and `addressOf`, which are the same shape.

**Keep the stored type clean.** `RemoteTarget` in `src/tab/types.ts` is both the stored shape on `Tab` and the wire shape on `TabView`, and it is persisted into agent state — a `reconnecting` written there would outlive the fact. So the wire gets its own `RemoteTargetView = RemoteTarget & { reconnecting?: boolean }` in `src/protocol/tab.ts`, and `TabView.remote` takes that. The flag is set only when true, so a healthy tab's remote target is byte-identical to what it is today.

**Give the control the whole target.** `remoteSessionControl` takes the tab's `remote` rather than a fourth boolean, so exactly one place decides how the flag is read. Its state resolves `provisioning` first — a channel with no workspace cannot be mid-backoff anyway, since the recovery branch requires both a session id and a workspace, and if the two ever did coincide the disabled control is the safe answer.

**Delete `inFlight`.** No call site supplies it and no test drives it; the component's own `pressed` state is the whole answer to "an action is in flight". Removing it is the honest reading, and it keeps the prop from looking like the seam for the spinner problem, which is a separate entry and a different fix.

## Implementation steps

1. Add `reconnectingOf(label)` to `RemoteManager` in `src/remote/manager.ts`.
2. Add `RemoteTargetView` to `src/protocol/tab.ts` and point `TabView.remote` at it.
3. In `src/tab/view.ts`, pass a `reconnectingOf` resolver from `buildTabViews` and have `buildTabView` fold the flag onto the remote target when it is true.
4. In `web/src/shared/remote-session-control.ts`, take the remote target and resolve `reconnecting` from it.
5. Pass `remote` at the four call sites: `web/src/harness/HarnessTab.tsx`, `web/src/ShellTab.tsx`, `web/src/agent-tabs/AgentTabBody.tsx`, `web/src/agent-tabs/InactiveAgentTabBody.tsx`.
6. Remove `inFlight` from `AgentTabMeta`'s props and from `RemoteSessionButton`.

## Tests

- `src/tab/view.test.ts`: a remote tab whose channel is reconnecting carries the flag on its view's remote target, and one whose channel is healthy does not carry the key at all.
- `src/remote/manager.test.ts`: `reconnectingOf` reports a channel mid-backoff and is false for a healthy one and for an unknown label.
- `web/src/harness/HarnessTab.test.tsx`: a tab whose remote target reports reconnecting renders the reattach control rather than detach. This is the wiring assertion that would have caught the defect — `web/src/shared/AgentTabMeta.test.tsx` already pins the component's behavior when it is handed that state, which is exactly why the suite reported this as covered.
- `web/src/shared/AgentTabMeta.test.tsx`'s existing remote-session cases must keep passing unchanged.

## Out of scope

- The spinner that never clears when an action leaves the tab open, which is its own backlog entry.
- The confirmation dialog's keyboard handling, likewise its own entry.
- `SessionsManager.reattachTab` and the `reattach` arm of the RPC, both of which are correct and were merely unreachable.

## Specs and docs

`product/specs/sessions-tab.md` already describes the control offering both verbs, which is what this makes true; no spec change. `help.md` and `documentation/user-documentation/` are checked at implementation time and document neither the control nor its states.
