# Opening a created visualization's tab

## Complexity

3/10 — the fix is a set on the index and three call sites. The work was the diagnosis: three facts that look reasonable alone deadlock against each other.

## Bug

Entering a source into the visualizations index disabled the plugin and opened no tab. Reported against a valid JSON file, but it was not specific to that file or to JSON — every source did it, because the cause is reached before any content is read.

## Root cause

Three facts, each correct on its own:

1. `src/plugins/visualizations/tabs.ts` — `create` sends the `create` topic action, then immediately reads the topic to build the tab's payload. If the record's window is not in it, `create` calls `reportFailure('created visualization is unavailable')`, which disables the plugin.
2. `src/visualizations/manager.ts` — `view()` projects a window only for a record that has an open tab, because a window carries the table and the topic is re-broadcast on every mutation. This is deliberate, and `manager.test.ts` asserts it.
3. `src/tab/openers.ts` — `openPluginTab` calls the payload factory *before* `addPluginTab` registers the tab, so the lookup cannot be deferred into the factory either.

So the create path requires a window that only comes into being once the tab it is building has been opened. It never resolves.

The same cause produced a second, unreported failure: `open` — loading a *saved* visualization whose tab is closed — found no window either, and instead of failing it returned. Opening a saved visualization from the index silently did nothing.

## Why the tests missed it

`src/plugins/visualizations/activate.test.ts` stubs the host, and its `create` stub pushed a window onto the topic, with a comment asserting the real host "answers with the record it created". It does not. The stub was built to satisfy the assertion it was meant to test, so the deadlock was invisible to it.

The regression test here is deliberately at the manager, against the real projection, rather than against a host stub. An earlier attempt at a plugin-level test was written and then discarded: it passed with the fix neutered, because the stub was doing the work the fix was supposed to do.

## Correct behavior

Creating a visualization opens its tab and leaves the plugin enabled. The record's window is available to the read that immediately follows the action asking for the tab, and is absent from every read after that.

## Reproduction

With a host stub whose `topicData` returns no window until `openOrFocusTab` has been called, `create` throws `created visualization is unavailable` and no tab is opened. At the manager, `create` followed immediately by `view().windows` returns `[]`, so the plugin finds no window for the record it just made.

## The fix

`VisualizationIndex` gains a set of records whose tab is about to open, exposed as `expectTab(id)`, cleared in `release`. `windows()` projects those alongside the open ones. The manager calls `expectTab` from `create` and `load`.

The set is short-lived by design: `expectTab` drops the id in a `queueMicrotask`. The plugin's read is synchronous after the action that set it, so a microtask answers that one read and leaves every later broadcast clean. Without the microtask the window would ride on every mutation for every record nobody is looking at — the exact cost the tab-gating exists to avoid, and the reason a created-but-never-opened record must not project at all.

`manager.ts` was at 200 of its 200 lines, so its three-line `openIds` adapter over `index.openIds(tabs)` was inlined at its two call sites.

## Tests

`src/visualizations/manager.test.ts` — a created record is projected before its tab exists; a loaded one likewise; and both stop being projected after a tick, so a record nobody opens puts nothing on the wire. The first two fail with `expectTab` neutered and pass with it.

## Verification

`./scripts/run.mjs check-diff`.

Live: a scratch instance, then one `e2e-driver` batch that runs the `visualizations` command, enters a source, and records whether a tab opened and the plugin is still enabled — the two things that were wrong before. The driver lives under `./temp/fix-a-bug-drivers/` so it survives the scratch teardown.

## Out of scope

- **The optimistic stub in `activate.test.ts`.** It is unfaithful and would hide the next bug of this shape too, but replacing it means driving a real manager through the plugin boundary, which is a change to how that suite is built rather than to this fix.
- **Whether `create` should report a genuinely lost record.** A record the host really had dropped is still worth reporting; distinguishing that from "the tab is not open yet" would need a signal the contract does not carry.
- **`src/plugins/visualizations/shared.ts` and `src/visualizations/manager.ts` are both at their 200-line ceiling.** The next change to either will hit it, and both want a deliberate split rather than a fourth workaround.
