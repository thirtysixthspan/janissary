# Queue shell-tab command-bar lines while zsh is busy

**Complexity: 6/10** — The application already owns a per-tab command queue, and the queue popup already lists and edits a shell tab's entries, but nothing ever adds to that queue from a shell tab and nothing drains it. The shell plugin needs two additive capabilities to reach its own tab's queue, two intents, and a small client-side drain that runs one line at a time as zsh returns to its prompt.

## Goal

While zsh is running a command, the shell tab's command line reads `queue >`. A line submitted then goes into the tab's command queue rather than reaching zsh or the application. When zsh returns to its prompt, the queue drains one line at a time: each line runs exactly as if it had just been typed, and a line sent to zsh waits for zsh's next prompt before the following entry runs.

## Approach

Keep the queue where the agent tab keeps its own: the tab's server-side runtime queue, which the state broadcast already sends as `commandQueue` and the queue popup already edits. Add two declaration-gated server capabilities, `queueLine` and `nextQueuedLine`, scoped to the answering tab like the other line capabilities, and expose them through `queue` and `dequeue` intents.

On the client, a framework-free `ShellCommandQueue` service tracks whether zsh is busy (from the existing OSC 133 command markers) and whether a drain is in progress. A submitted line is queued while either holds. Each time zsh reports it has returned to its prompt, the service dequeues and runs lines until the queue is empty or a line has been written to zsh, which then waits for the following prompt. A hook owns the service instance, and the bar passes `queue` as its label while zsh is busy.

## Implementation

1. Add `queueLine` and `nextQueuedLine` to the capability union, the capability table, the server capability type, and `lineCapabilities`; declare both in the shell manifest.
2. Add `queue` and `dequeue` intents to the shell activation, guarded by the existing string-line and empty-payload guards, with a `ShellQueuedLine` result type in the shared contract.
3. Make the shell submit path return whether a line was written to zsh and accept whether to record history, so a drained line is not recorded twice.
4. Add the `ShellCommandQueue` service and a `useShellCommandQueue` hook; route submissions through it and pass the `queue` label to the command bar while zsh is busy.
5. Update the shell-tab spec, the shell user documentation, and the tab-plugin developer reference.

## Tests

- Server: `queueLine` adds to the answering tab's queue and `nextQueuedLine` removes its front entry; both are inert once the plugin is disabled and refused when undeclared.
- Server: the `queue` and `dequeue` intents call the capabilities and reject a non-string line.
- Client service: a line is run directly while idle, queued while busy, queued while a drain is in progress, and drained one at a time, stopping after a line written to zsh until the next prompt.
- Client component: the bar reads `queue` while zsh is busy, a submitted line is sent to the `queue` intent rather than zsh, and the queued line runs when zsh returns to its prompt.

## Out of scope

- Queuing lines typed directly into the terminal, which belong to zsh.
- Changing the agent tab's queue, the queue popup, or the `queue <agent> <command>` command's refusal of non-agent tabs.
