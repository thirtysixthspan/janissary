# Clear the remote session control's spinner

Issue: the remote session control spins forever when its action does not close the tab.

Complexity rating: 4/10

## Goal

`RemoteSessionButton` sets `pressed` when an action is raised and never clears it, relying on the tab unmounting on a successful detach. Every outcome that leaves the tab open — a detach refused because the session cannot be recorded, a reattach, or a request the server drops — leaves the control spinning and disabled for the life of the tab. All of them are silent, because `remoteSession` is an `ack` method with no answer wired back.

The user whose detach was refused is left with a permanently spinning, permanently disabled control and no message anywhere. The tab reads as mid-operation forever and the only way back is to close and reopen it, and the same shape hides every future failure of this control rather than reporting it.

## Approach

**Give the action an answer to clear on.** `remoteSession` becomes a `result` method rather than an `ack`. `ControllerCore.remoteSession` already delegates to `SessionsManager.detach` and `reattachTab`, both of which return a boolean; it returns that instead of discarding it. Answering `'ok'` to an action that was refused is a lie on the wire, and it is the lie the spinner is built on.

`remoteSessionControl` raises the call through `client.request` rather than `client.send`, so it has a promise to hand back. That promise settles in every case the entry names: on the server's answer, and — because `JanusClient.request` resolves `undefined` when the socket is not open or the connection ends first — on a request nobody answers. The control clears its spinner when the promise settles, whatever it settled to. A successful detach can therefore un-spin a moment before its tabs close, which is the accepted cost: the alternative is the current state, where every other outcome never un-spins at all.

The button tolerates an `onAction` that returns nothing, which is what a test double supplies, by resolving whatever it gets.

**Report the refusal.** A refused detach already reaches the notifications feed with its reason. `SessionsManager.reattachTab` is the remaining silent refusal — it answers false when no live channel holds the label, which is exactly the case where the user has pressed a control on a tab whose connection is already gone — so it says so in the feed the way the successful actions do.

## Implementation steps

1. In `src/client-message.ts`, change `remoteSession` from `'ack'` to `'result'`.
2. In `src/controller.ts`, have `remoteSession` return the boolean both manager methods already answer with.
3. In `src/message-handler.ts`, return that value from the `remoteSession` case rather than discarding it.
4. In `src/sessions/manager.ts`, have `reattachTab` report its refusal to the notifications feed before answering false.
5. In `web/src/shared/remote-session-control.ts`, raise the action through `client.request` and return the promise, falling back to `send` where no `request` exists — the guard `useSelectionAction` already establishes.
6. In `web/src/shared/RemoteSessionButton.tsx`, clear `pressed` when the raised action settles.

## Tests

In `web/src/shared/AgentTabMeta.test.tsx`, beside the existing `spins and refuses a second press once an action is in flight` case:

- The in-flight case is driven by an action that has not answered yet, rather than by one that answered synchronously — which is what makes "in flight" mean anything.
- A refused action returns the control to its pressable state.
- A reattach clears the spinner without the tab unmounting.

In `src/sessions/manager.test.ts`:

- `reattachTab` on a label no live channel holds reports a line to the feed and answers false.

In `src/message-handler.test.ts`:

- `remoteSession` replies with what the controller answered rather than `'ok'`, so a refusal is distinguishable on the wire.

## Out of scope

- What a refused detach's reason says, which the previous entry settled.
- The confirmation dialog's keyboard handling, which is its own entry.
- Every other `ack` method; this one changes because it has an outcome the client needs.

## Specs and docs

- `product/specs/sessions-tab.md`: the control's paragraph says it shows a spinner while an action is in flight; extended to say the spinner clears when the action is answered, including when it was refused, so the control is never left mid-operation.
- `help.md` and `documentation/user-documentation/`: checked at implementation time; neither documents the control.
