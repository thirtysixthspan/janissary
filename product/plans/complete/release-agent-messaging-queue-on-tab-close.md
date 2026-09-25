# Release the agent-messaging queue when its tab closes

## Complexity

3/10. The change is confined to `AgentCommunicationManager` in `src/agent/communication-manager.ts`, `pumpQueue` in `src/agent/message-queue.ts`, one entry in `MANAGER_TAB_RELEASE` in `src/managers.ts`, and tests. No wire, protocol, or command-syntax changes.

## Goal

`AgentCommunicationManager` keeps `queues: Map<string, Message[]>` and `processing: Set<string>` keyed by tab label, but it has no `closeTab` and is not in `MANAGER_TAB_RELEASE`, so closing a tab never releases either. `pumpQueue` returns early while `processing.has(label)` and clears the flag only from the `done` callback the handler calls.

A `command` or `request` message running `shell …` waits on its end sentinel. Closing the tab kills the shell, the completion never fires, and the label stays in `processing` forever. Labels return to the pool, so a later tab given the same name silently never receives `msg` or `broadcast` again for the rest of the run.

After this change, closing a tab drops its queued messages and its in-progress flag, and a late `done` from the closed tab's message cannot clear the flag or re-pump the queue of a newer message delivered to a reused label.

## Approach

- Change `processing` from `Set<string>` to `Map<string, number>`, recording the id of the message being handled for each label. Message ids come from the manager's own monotonically increasing counter, so they are unique for the run.
- In `pumpQueue`, the `done` callback deletes the flag and re-pumps only while `processing.get(label)` is still that message's id. A stale `done` from a message whose tab closed (or whose flag was already released) does nothing.
- Add `closeTab(label)` to `AgentCommunicationManager`, deleting the label's queue and its `processing` entry.
- Add `'communication'` to `MANAGER_TAB_RELEASE` so `closeTabResources` in `src/tab/cleanup.ts` calls it on every tab close. The compile-time `MANAGER_TAB_RELEASE_IS_TYPED` check then proves the method exists.

Rejected: making the release list discover every manager with label-keyed state automatically. The list is deliberately opt-in and typed (see the comment above `MANAGER_TAB_RELEASE`); changing that is out of scope.

## Implementation steps

1. `src/agent/message-queue.ts`: take `processing: Map<string, number>`, record `message.id` when starting, and guard the `done` callback on the recorded id.
2. `src/agent/communication-manager.ts`: switch `processing` to `Map<string, number>` and add `closeTab(label)`.
3. `src/managers.ts`: add `'communication'` to `MANAGER_TAB_RELEASE`.
4. `src/tab/cleanup.test.ts`: the manager fixture gains `communication: { closeTab: vi.fn() }` and the "walks exactly the declared release list" case drops `'communication'` from the managers it blanks out, because the plan deliberately moves it into the declared list.
5. The hand-built manager fixtures that close tabs through the real `TabManager` gain the same `communication: { closeTab: vi.fn() }` stub, since the walk now calls it: `src/tab/manager.test.ts`, `src/plugins/notifications.test.ts`, `src/plugins/grouping.test.ts`, `src/plugins/update-tab.test.ts`, and `src/plugins/teardown.test.ts`.
6. Run `./scripts/run.mjs check-diff` after each step.

## Tests

- `src/agent/communication-manager.test.ts`: a `request` is in flight (its capture never completes), the tab closes, a new tab opens with the same label, and a `msg` info to it is delivered.
- `src/agent/communication-manager.test.ts`: a `command` is in flight, the tab closes, a new tab with the same label receives a `command` that is also in flight, then the closed tab's late `done` fires; a further queued message for the new tab is not started until the new command finishes.
- `src/agent/communication-manager.test.ts`: messages still queued behind an in-flight one for the closed tab are dropped and never delivered to a reused label.
- `src/tab/cleanup.test.ts`: closing a tab calls `communication.closeTab` with its label.

## Out of scope

- Making the tab-release list exhaustive over managers that hold label-keyed state.
- Cancelling the capture itself (the shell, ACP, or browser call) of a message in flight at close; the owning managers already tear those down through their own `closeTab`.

## Documentation and specification impact

`product/specs/messaging.md` gains a sentence: closing a tab discards any messages still queued for it, and a tab that later reuses the name starts with an empty queue. `help.md` and `documentation/user-documentation/` do not describe queue lifetime and are left alone.
