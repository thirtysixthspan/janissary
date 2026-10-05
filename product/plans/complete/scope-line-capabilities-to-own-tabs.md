# Scope queueLine, nextQueuedLine and recordCwd to the plugin's own tabs

**Complexity: 3/10** — one resolver in `src/plugins/line-capabilities.ts`, three capability bodies that use it, doc-comment updates in `src/plugins/api.ts`, tests, and a spec sentence. No new capability, no wire change, and the API integer stays at 1.

## Goal

`queueLine`, `nextQueuedLine` and `recordCwd` act on `answeringLabel ?? origin.label` without checking whose tab that is. An intent from a shell tab answers with the shell tab's own label, which is the case they were built for. But a command, selection action or menu handler invoked from an agent tab has no answering tab, so the label falls back to the agent tab. Any plugin that declares these capabilities can then push lines into an agent tab's command queue (which runs them as commands), drain lines the user queued there, or rewrite that tab's recorded working directory, which moves where its completion, file navigator and new shells start.

Every other capability that changes a tab (`updateTab`, `dockTab`, `setUnread`, `snapshotTab`, `terminalRunning`) is already limited to tabs the calling plugin owns. These three should be too.

## Approach

Replace `lineLabel()` in `lineCapabilities` with a resolver that returns the answering or origin label only when `managers.tab.byLabel(label)?.plugin?.id === declaration.id`, and `undefined` otherwise. `queueLine` and `recordCwd` do nothing when it is `undefined`; `nextQueuedLine` returns `null`. This is a silent no-op rather than a rejection, matching how `updateTab`, `dockTab` and `setUnread` treat a tab the plugin does not own.

`dispatchLine`, `dispatchLineWithOutput`, `completeLine` and `originTab` are left as they are. Running a line in, completing for, or describing the tab a command was invoked from is their documented purpose, and they change no queue or recorded state of their own.

Rejected alternative: rejecting the call with `rejectRequest`. The shell plugin only calls these from its own tab's intents, so a mismatch is never a caller mistake the user could correct, and a rejection would surface a confusing line in the transcript of a tab the plugin was never meant to touch.

## Implementation steps

1. `src/plugins/line-capabilities.ts`: replace `lineLabel` with `ownLineLabel`, which resolves `answeringLabel ?? origin.label` and returns it only when that tab's `plugin.id` is the declaration's id. Use it in `queueLine`, `nextQueuedLine` and `recordCwd`, and update the comments above them.
2. `src/plugins/api.ts`: update the doc comments on the three capabilities to say they act on this plugin's own answering tab and do nothing for any other tab.
3. Tests (below).
4. `product/specs/tab-plugins.md`: add a sentence to "Intents and resources" saying a plugin can queue lines on, take lines from, and record the directory of only its own tabs.

## Tests

In `src/plugins/shell-capabilities.test.ts`:

- The existing answering-tab fixtures resolve `shell1` to a tab owned by the `shell` plugin, so the existing queue and cwd tests keep passing.
- `queueLine` and `nextQueuedLine` from a command context whose origin is an agent tab (no answering tab) neither enqueue nor dequeue, and `nextQueuedLine` returns `null`.
- `queueLine` and `nextQueuedLine` with an answering tab owned by another plugin touch no queue.
- `recordCwd` from a command context whose origin is an agent tab records nothing.
- `recordCwd` with an answering tab owned by another plugin records nothing.

## Out of scope

- `dispatchLine`, `dispatchLineWithOutput`, `completeLine` and `originTab`, which act on the invoking tab by design.
- `documentation/developer-documentation/tab-plugins.md`, which the entry does not ask to change.
- The other entries in the pull request's backlog.
