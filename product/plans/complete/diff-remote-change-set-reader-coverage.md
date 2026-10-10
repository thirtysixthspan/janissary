# Test the remote change-set reader and its guard

**Complexity: 3/10** — coverage only. One new test file beside `remote-change-set.ts`, three cases added to the guard's own file, one case in the sessions manager's `offers` block, and one small correction to the reader so the rejection its own module comment promises to refuse is refused rather than propagated.

The plan's Tests section calls for "the change-set read against a remote port". `src/plugins/diff/remote-change-set.ts` — the module that turns a far side's answer into the result a recompute publishes, and refuses one that is malformed — ships with no test of its own, so `isChangeSetResult` and the unusable-answer path are unverified. That guard is the boundary between another process's JSON and the payload the tab publishes: a guard that lets a malformed answer through publishes it as a change set, and one that rejects a good answer shows a failure where changes exist.

## Goal

Every route through `readRemoteChangeSet` is pinned: a well-formed `{ kind: 'files' }`, `{ kind: 'not-repository' }` and `{ kind: 'error', reason }` pass through as the matching `ChangeSetResult`; every malformed shape — `null`, a missing `kind`, a `kind` outside the three, a `files` that is not an array, and a file record that fails `isDiffFile` — answers `{ kind: 'error', reason: 'The remote host did not answer with a change set.' }`; a capability answering `null` produces that same error result rather than a throw; and a rejected capability promise does not escape either.

## Approach

The module's own comment says the answer "is checked before it is believed ... and a malformed one is reported as the tab's error state rather than published". Every malformed shape already is, once `isChangeSetResult` is applied. A *rejection* is not: `await answer` propagates it, so a far side whose channel dies mid-read answers the tab through the caller's own catch — with the rejection's raw text instead of the module's reason — and a caller without that catch would see it escape. That is a coverage gap the entry names explicitly ("a rejected capability promise does not escape"), so the reader gains a rejection guard answering the same error result. No other behavior changes.

## Implementation steps

1. `src/plugins/diff/remote-change-set.ts` — wrap the capability's answer in a rejection guard that answers the same error result, so a far side that throws is indistinguishable from one that answered unusably.
2. `src/plugins/diff/remote-change-set.test.ts` — new file beside the module, with a fake `TabPluginServerCapabilities` whose `readWorkspaceChangeSet` answers each of the shapes above, plus `null`, a resolving-then-unusable answer, and a rejecting one. Assert the full-file list the reader hands the far side.
3. `src/plugins/diff/change-set.test.ts` — in a new `isChangeSetResult` block beside the real-repository cases that file already carries, cover the same three pass-throughs and the malformed shapes, so the guard is verified where it is declared rather than only through its caller.
4. `src/sessions/manager.test.ts` — one case in the `SessionsManager offers` block asserting `offers('diff', { label })` authorises a ready live row and refuses a label no row names, pinning the verb's narrowing the way the other verbs' are.

## Tests

- `src/plugins/diff/remote-change-set.test.ts` — the pass-through and malformed groups listed above.
- `src/plugins/diff/change-set.test.ts` — the same three pass-throughs for `isChangeSetResult` directly.
- `src/sessions/manager.test.ts` — the one `offers('diff')` case.

## Spec updates

- `product/specs/diff-tab.md`, **Empty and failure states** — a far side that answers unusably and one that
  answers not at all both show **The remote host did not answer with a change set.**, which is the
  wording the rejection guard now makes true. Nothing else in the spec describes this route.

## Out of scope

- The far-side `changeSet` dispatch the capability calls into (`src/remote/serve-change-set.ts` and the port's own test), which owns what the far side answers rather than what the local reader does with it.
- `managers.workspace`/`session.ts`'s wiring of `remoteReader`, already exercised through the plugin activation test.
- Any change to the wording of `UNUSABLE_ANSWER` or the tab's error state rendering.
