# Key the schedule manager's entry hooks by tab and entry id, not by one joined string

**Complexity: 2/10** — one private field changes shape and three private helpers follow it. No behavior changes for any label that was already unambiguous, and no caller outside the class can see the difference.

## Problem

`hookKey` joined a tab label and an entry id with a single space, and `removeHooks` matched with `startsWith`. So `forgetHooks('codex team')` also matched `codex team 2`'s hooks: closing, clearing or cancelling one tab's schedule dropped another tab's callback, and that tab's resume would be delivered with its flag left reading green `Auto-resuming` for the rest of its life.

The trigger is narrow — a label containing a space — but real: a profile harness entry's `name` is validated only as a nonempty string, so `codex team` is a legal profile entry that opens a tab with that label.

## Approach

`hooks` becomes `Map<string, Map<string, EntryHooks>>`, keyed by label and then entry id. No separator is chosen, so no label can be mistaken for part of an id:

- `entryHooks(label, id, hooks)` creates the inner map on demand and writes it;
- `fireHook` and `removedHook` read the inner entry, then call `forgetHook` to drop it — so both still report at most once, and a later entry reusing the id is not answered by the old callbacks;
- `forgetHook` deletes the inner entry and the outer map when the inner one empties;
- `removeHooks(label)` drops the outer map outright and reports `removed` for everything in it, which is both what `clearAll`/`delete` want and one line shorter than the prefix scan it replaces.

`hookKey` goes away with nothing replacing it.

## Tests

Two cases in `src/schedule/manager.test.ts`, on a new `twoHarnessTabs` fixture that gives the fake tab manager two tabs whose labels differ only by a suffix:

1. `clearAll` reports `removed` for both tabs' hooks — the callbacks are found under their own labels rather than one prefix;
2. a `codex team 2` entry still fires after `codex team`'s schedule was replaced with an empty list, asserting both the callback and the PTY write.

The fixture's fake tabs carry `view: 'harness'`, or `fire` would take the agent branch and dispatch to the stub instead of typing into the PTY.

## Spec

None. No user-visible behavior changes: the collision required a label with a space and produced a stuck flag rather than a wrong schedule, and the flag's own contract is already stated in `product/specs/harness.md`.

## Verification

`./scripts/run.mjs check-diff`. To see the old shape's failure, restore a joined key and run the second case: `codex team 2`'s hook is dropped by the shorter label's `set`, and its callback never runs.