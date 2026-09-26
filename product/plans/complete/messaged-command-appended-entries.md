# Read a messaged command's reply from the entries it appended, not the log's length

**Complexity: 2/10** — one method in `src/capture/manager.ts` swaps a length comparison for a bus subscription, plus one new test and a spec sentence. No wire change, no new module.

`CaptureManager.runCommand` answers a `msg … command` / `request` routed through the registry by comparing `tab.log.length` before and after `executeCommand`, and replies with the last entry when the length grew. But `appendEntry` caps the log at `transcriptMaxLines` by slicing from the front, so once a tab is full an append leaves the length unchanged and the reply is empty, even though the recipient's transcript shows the output. The sending agent then acts as if the command did nothing.

## Goal

A messaged command answers with the last transcript entry it appended whether or not the recipient tab's transcript is at its cap. A command that appended nothing still answers with an empty string.

## Approach

`appendTab` in `src/tab/transcript/events.ts` emits `transcript` / `entry:appended` with `tabLabel` on every append, capped or not. In `runCommand`:

1. Subscribe with `messageBus.on('transcript', 'entry:appended', ...)` just before awaiting `executeCommand`, counting events whose `tabLabel` is the recipient's label.
2. Unsubscribe in a `finally`, so a command that throws does not leak the listener.
3. When the count is above zero, reply with `managers.tab.byLabel(label)?.log.at(-1)?.output ?? ''`; otherwise reply `''`.

This keeps today's rule of reporting the tab's last entry as it stands when `executeCommand` resolves, and drops the `tab!` non-null assertion. Counting from the bus rather than diffing lengths is what makes the cap irrelevant.

## Tests

- `src/capture/manager.test.ts`: the existing "executes a matched command and reports its logged output" case keeps asserting the reply, but its fake `executeCommand` now appends through `appendTab` (which is what the real append path does) instead of pushing onto the log directly, since a bare push emits nothing.
- New case: the tab's log is already at a cap of three entries; the fake command appends through `appendTab` with a cap of three, so the length stays the same, and the reply is still the command's output. This fails on the old code.
- New case: a command that appends to a different tab only answers with an empty string, so the label filter is pinned.

## Specs and docs

- `product/specs/messaging.md`: the sentence saying the response is the last transcript entry the command appended gains that this holds even when the recipient's transcript is at its line cap.
- No `help.md` or user documentation describes the read-back.

## Out of scope

- A command that appends and then has an unrelated entry land in the same tab before it resolves still reports that later entry, as it does today. Having `run` return its output would close that seam and is separate work.
