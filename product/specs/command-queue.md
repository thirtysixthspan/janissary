# Command queue

Command queues are an optional core tab capability. Any tab may opt in; having a command bar, being busy, or owning a terminal does not create a queue. Shell tabs currently opt in. Shell and harness tabs have no queue: typed commands, `send`, scheduled commands, and accepted monitor suggestions dispatch immediately through their existing pipeline, including during workspace provisioning. Individual commands keep their own concurrency and readiness checks.

## Ownership and availability

Core stores each queue on the tab's runtime record and exposes its rows through `TabView.commandQueue`. `TabView.hasCommandQueue` is present only for an opted-in tab; other tabs expose an empty list. Core tabs may set `Tab.hasCommandQueue`. A tab plugin opts in by requesting both `queueLine` and `nextQueuedLine` in its static declaration. The host resolves availability in `src/command-queue/support.ts`, without activating plugins. A terminal and `hostsCommandBar` are not required for this opt-in.

`queueLine(line)` appends to the plugin's own answering tab. `nextQueuedLine()` removes and returns its front line, or `null` when empty. Both are host capabilities, bound to that plugin's own tab; neither reaches a different plugin's tab or a shell tab that invoked a plugin command. Disabled plugins touch no queue. A plugin that requests neither capability can host the application command bar without offering a queue. See [[tab-plugins]].

The framework-free `CommandQueue` service in `web/src/shared/command-queue/command-queue.ts` and its `useCommandQueue` hook are published through `web/src/plugins/api.ts`. Consumers supply an enqueue/dequeue transport, a line runner, and busy/idle signals. The service and hook own FIFO handling, draining, wakeups, and disposal. The shell plugin supplies thin intent adapters, routing, history attribution, and zsh's status markers. There is no command-queue plugin.

## Queueing and draining

Each queue is FIFO and unbounded. `CommandQueue.submit(line)` queues while the consumer is busy or a drain is in progress and returns `true`; otherwise it runs the new line and returns `false`. A submitted line holds the drain until its runner settles, so a second submission cannot overtake it while its busy signal is still arriving. The runner receives whether a line came from storage. A `true` result pauses draining until `setBusy(false)`; a `false` result continues immediately to the next stored line. `wake()` drains externally added work only while idle. `dispose()` prevents a drain taking more lines; the hook pairs it with `attach()` on mount.

Shell command-bar submissions queue while zsh runs a command or its workspace is provisioning, and are recorded in the bar's history when queued. Each drained line follows ordinary shell-bar routing: application commands reach the application and unclaimed lines reach zsh. A line written to zsh waits for the next prompt; an application reply continues to the next entry. The shell reads only its own broadcast queue, whether current, docked, or hidden. Direct terminal keystrokes and the scheduler's direct shell-terminal delivery bypass this queue. See [[shell-tab]] and [[scheduling]].

## Command and errors

`queue <shell-tab> <command...>` appends to a named tab's opted-in queue, including a provisioning shell or a plugin tab without a terminal. Labels and display aliases resolve through the ordinary target lookup. On success, the issuing transcript records `→ <label> (queued): <command>`. An idle consumer wakes on the updated queue; a busy consumer waits for its idle signal.

Missing arguments return `Usage: queue <shell-tab> <command>`. An unknown target returns `No tab named "<label>".`. A target without queue support, including a harness tab, returns `Tab "<label>" has no command queue.`. The usage names the shipped shell consumer; queue eligibility is generic. Bare `queue` is the interactive popup command, and is a no-op when dispatched non-interactively on the server.

`send <shell-tab> <text>` uses the same shell FIFO, with the ordinary send acknowledgement. See [[send]].

## Command-line indicators and popup

While a shell consumer is busy, its prompt reads `queue >` and its status dot blinks. `Ctrl+E` and bare `queue` open the core popup only when the source tab has a queue and hosts the application command bar. They do nothing on harness tabs, tabs without queues, or queue consumers without that edit surface.

The popup lists the source tab's queued lines front first and shows `(no commands queued)` when empty. It remains bound to a docked shell's bar when another tab is current. Selection and edits never alter another tab's draft or focus.

| Input | Effect |
| --- | --- |
| Opening, Up / Down, or clicking a row | Select the row and copy its text into the owner's command bar |
| Typing or Backspace / Delete with text present | Edit the selected row through the core `editQueuedCommand` RPC |
| Backspace / Delete on an empty bar | Remove the selected row through `deleteQueuedCommand`, clamp selection, and leave the bar empty |
| Return | Do not submit, run, or close the popup |
| Escape | Close the popup and clear its owner's bar |

The command bar is the popup's only edit surface. Empty strings are valid queued rows and execute as no-ops in the shell. Edits and deletions use the named tab and queue index; an unavailable tab or out-of-range index is a no-op. Selection clamps when the queue shrinks, without recalling a different row into the draft. If its source closes and the fallback tab has no queue edit surface, the popup closes.

## Commands handled before queueing

Shell command-bar interception handles `hist`, `nav`, `syntax theme`, bare `theme`, bare `profile launch`, `quit`, `close` / `exit`, bare `queue`, and bare `tasks` immediately. They do not enter the FIFO from an interactive submission. A picker word encountered while draining a hidden shell is handled without opening an unseen popup, then draining continues.

## Persistence

Queues live only for the lifetime of their owning tab. Closing the tab removes its queue; no profile or relaunch restores it. No queue configuration or saved queue state needs migration.
