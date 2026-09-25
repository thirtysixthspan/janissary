# Correct the claim that each replacement browser gets a new internal address

**Complexity: 2/10** — one sentence in three places plus one design decision, and one sentence in the pull request's own description. The code is already right; the record of it is not, and a record that says a later change would be a regression is worse than no record.

## Summary

`upstreamOf` builds the same browser port and the same `internalPath` token for every generation of a tab, and the lazy suite pins that by expecting the second connect to return the first connect's URL unchanged. Four places say otherwise: this pull request's description, the harness spec, the sandbox spec, and design decision 4 of the plan that ships inside this pull request. A reader judging the containment story from those sentences believes each browser sits behind a fresh unguessable path, which is both untrue and — because the truth is one private address for a tab's life with a changing process behind it — the safer claim to have written down.

## Design decisions

1. **One private address, a changing process.** The published endpoint, the guard's port and path, and the private port and path behind the guard all belong to the tab for as long as the tab is open. What a death changes is the process, its scratch directory and the Chromium behind it. That is the accurate statement, and it does not weaken anything: the path is still unguessable, and it is still never handed to the harness.

2. **The guard asks per client; the answer is fixed.** The sandbox spec's "named per connection rather than fixed" was two true halves fused into one false sentence. The guard does ask for the live upstream on each incoming client rather than pairing one at startup — that is what lets the endpoint outlive every browser behind it — and the value it gets back never changes for the tab. The rewrite keeps the first and drops the second.

3. **The plan that ships in the pull request is part of the record.** Design decision 4 promises the next connect a "fresh internal upstream". A plan in `product/plans/complete/` is what a later reader consults before changing this path, so a claim in it that nobody implemented has to be corrected rather than left to be rediscovered.

4. **The description keeps everything else the author wrote.** The correction names the one sentence that is wrong; the rest of the body, including the reviewer notes and the verification steps, is the author's statement of intent and stays byte-for-byte.

## What already exists (reuse, don't rebuild)

| Need | Existing precedent | Location |
| --- | --- | --- |
| The evidence for all four corrections | the case expecting the second connect to return the first connect's URL | `src/browser/e2e-server-lazy.test.ts` |
| The address that never changes | `upstreamOf` | `src/browser/e2e-server.ts:127` |

## Proposed changes

1. **`product/specs/harness.md`.** The paragraph beginning "Because the endpoint is minted at launch" says the private address behind the guard belongs to the tab for as long as the tab is open, and that a replacement is a different process behind it.

2. **`product/specs/sandbox.md`.** The protocol-guard paragraph says the guard asks for the live upstream on each client rather than pairing one at startup — so the published endpoint can outlive every browser behind it without being republished — and that the private address itself never changes for the tab's life.

3. **`product/plans/complete/workspaced-harness-connect-triggered-browser.md`.** Design decision 4 says the next connect restarts a fresh process and scratch directory behind the unchanged published endpoint, and that the private address behind the guard is the same one.

4. **The pull request's description**, after the push: the "What" paragraph's "new internal address underneath" becomes the accurate statement. The second behavior example already says the replacement is spawned behind the same endpoint and needs no change.

## Tests

None. No code changes; the case that pins the behavior is `src/browser/e2e-server-lazy.test.ts`'s "starts a fresh browser behind the same endpoint on the next connect", which must keep passing.

## Out of scope

- No change to `upstreamOf`, to the ports, or to the tokens.
- No new containment claim, and no change to anything else in the pull request's description.

## Verification

`./scripts/run.mjs check-diff`, then grep the three files and the description for "new internal address" and "fresh internal upstream" and expect nothing.
