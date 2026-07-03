# Monitors have access to tab transcripts

**Complexity: 4/10** — prime the monitor buffer with existing transcript entries during `start()`; no UI changes, no protocol changes, no new types.

## Goal

When a monitor starts, it should receive the existing transcript entries from its target tabs, not just entries that arrive after the monitor starts. Currently, a monitor only sees entries emitted *after* it subscribes to `entry:appended` events, giving it no historical context.

## Background

The `MonitorManager.start()` method creates a `MonitorSub` with an empty `buffer`, opens an ACP session primed with the persona, subscribes to `entry:appended` events, and sets a flush timer. New transcript entries land in `reg.buffer` via the subscription and get flushed to the ACP session every 30 seconds.

Each `Tab` already carries its full transcript in `tab.log: LogEntry[]`. The `start()` method has access to `this.managers.tab.tabs`, so reading the existing transcript is straightforward.

## Approach

In `MonitorManager.start()`, after subscribing to events but before the first flush, iterate over the resolved targets and push each target tab's existing `log` entries into `reg.buffer`. The entries will be included in the first flush batch, giving the monitor full historical context.

For inline monitors (no explicit targets), the resolved target is the owner tab itself, so its transcript is primed automatically.

Entries are pushed in chronological order (the order they appear in `tab.log`), preserving the same sequence as if the monitor had been running from the start.

## Implementation steps

1. **Prime the buffer in `start()`** — after `this.subscribe(key, reg)` and before `reg.timer = setInterval(...)`, iterate resolved targets, find matching tabs, and push each tab's `log` entries into `reg.buffer`.

2. **Write tests** — add test cases to `src/monitor-manager.test.ts` verifying that:
   - Starting a monitor on a tab with existing entries primes the buffer
   - Starting a monitor on a group target primes entries from all group members
   - Primed entries are included in the first flush
   - Entries are ordered chronologically

3. **Run `./scripts/run.mjs check-diff`** after each step.

## Testing

- `src/monitor-manager.test.ts` — new test cases:
  - Starting an inline monitor on a tab with existing entries includes those entries in the first flush
  - Starting an external monitor on a tab target includes existing entries
  - Starting a monitor on a group target includes existing entries from all group members
  - Existing entries appear before new entries that arrive after start

## Out of scope

- Harness tab transcripts (issue #3) — harness tabs have no transcript to prime
- UI changes — the web client is unchanged
- Protocol changes — no new RPC methods
- Session priming — entries go through the buffer/flush path, not the session priming prompt

## Verification

`./scripts/run.mjs check-diff` must pass clean.
