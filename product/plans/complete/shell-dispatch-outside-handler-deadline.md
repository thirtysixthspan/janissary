# Run shell-dispatched application commands outside the plugin handler deadline

**Complexity: 5/10** — no plugin API shape changes; the host's guarded-call deadline learns to stop counting while the host does work a plugin asked for, and the one capability that runs a whole application command uses it.

## Goal

An application command typed into a shell tab's command bar (another plugin's command, a large `open`, an agent launch) must never trip the shell plugin's own 5000 ms intent deadline. Today the shell's `dispatch` intent awaits `dispatchLineWithOutput`, which awaits the entire command inside the guarded call, so a slow command disables the shell plugin and closes every shell tab and zsh process. The tab-plugins spec already says the deadline covers plugin work only; this makes that true for dispatched lines.

## Approach

The reviewer's proposal was to defer command execution past the handler, the way `openClaimedFiles` targets are queued, and deliver the reply through a follow-up intent or a host push. That needs a new reply channel on the wire and a client change, because the reply is the intent's result. The simpler route keeps the intent and its result exactly as they are and changes only how the host measures the plugin's time.

1. **A pausable handler deadline.** `guardPluginCall` in `src/plugins/guard.ts` becomes a `setTimeout`-based deadline that hands the call a `HandlerDeadline` with one method, `exempt(work)`. While any exempted work is in flight the clock is stopped; when the last one settles the clock resumes with whatever budget the plugin had left. Plugin code before and after the host work is still timed, so a plugin that hangs on its own still times out with the same `handler timed out after N ms` reason. Existing callers (the web editor and overlay hosts, and every server caller) pass a call that ignores the argument, so their behavior is unchanged. One definition of a guarded call stays shared by both sides.
2. **The host exempts its own command run.** `invokePlugin` hands the deadline to `createPluginContext`, which passes it to `lineCapabilities`. `dispatchLineWithOutput` wraps the host's `CommandManager.dispatchLineWithOutput` call in `deadline.exempt`, so the command's whole runtime (including another plugin's activation and handler, each under its own guard) is the host's time, not the shell's.
3. **A bounded reply capture.** With the plugin deadline no longer cutting it off, a command that never finishes would hold the shell's `dispatch` intent, and with it the bar's submit and queue drain, forever. `CommandManager.dispatchLineWithOutput` therefore waits at most 30 seconds for the command, then answers with the output captured so far and stops capturing. The command keeps running; anything it says later lands in the tab's own record as it always would.

Rejected: moving execution after the handler returns (the `openClaimedFiles` model). That changes the intent contract and needs a second reply path to the client for no gain over pausing the clock, and it would make the reply arrive by a different route from every other intent result.

## Implementation steps

1. `src/plugins/guard.ts`: add `HandlerDeadline` and rewrite `guardPluginCall` on a pausable timer; the call receives the deadline.
2. `src/plugins/invoke.ts`: pass the deadline from the guarded call into `createPluginContext`.
3. `src/plugins/context.ts`: accept an optional `deadline` and hand it to `lineCapabilities`.
4. `src/plugins/line-capabilities.ts`: run the host's `dispatchLineWithOutput` inside `deadline.exempt` when a deadline is present.
5. `src/command/manager.ts`: bound `dispatchLineWithOutput`'s wait with a capture limit (default 30 000 ms, overridable for tests), unsubscribing the capture when the limit is reached.
6. Update `product/specs/tab-plugins.md` (deadline covers plugin work only, now naming dispatched lines) and `product/specs/shell-tab.md` (a slow application command does not disable the shell; the reply waits at most 30 seconds). Neither `help.md` nor the user documentation describes the handler deadline, so neither changes.

## Tests

- `src/plugins/guard.test.ts` (new): a call that finishes in time resolves; a call that runs past the deadline rejects with `handler timed out after N ms`; exempted host work longer than the deadline does not time the call out; plugin time before and after exempted work is still counted and still times out.
- `src/plugins/dispatch-deadline.test.ts` (new): through `TabPluginHost` with a 20 ms handler deadline, a plugin intent whose handler calls `dispatchLineWithOutput` for a command that takes longer than the deadline returns the command's output, leaves the plugin `active`, and closes no tab. A handler that hangs on its own still disables the plugin.
- `src/command/manager.test.ts`: a command that never finishes answers with the output it has produced once the capture limit passes; the existing capture cases keep passing.

## Out of scope

- Removing the unused `dispatchLine` capability or sharing the capture helper with `CaptureManager` (a separate backlog entry).
- Bounding `msg` capture in `CaptureManager`.
- Any client change: the shell still receives the reply as the `dispatch` intent's result.
