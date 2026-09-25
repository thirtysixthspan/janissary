# Correct the user documentation and the remote spec that contradict the connect-triggered browser

**Complexity: 2/10** — prose in four files, no code. The risk is not in the writing but in writing something else that is also untrue, so the superseded phrases are grepped for before and after rather than found by reading.

## Summary

The plan's documentation step named two specs and the installed-runtime guidelines, and the diff touched exactly those. Four other places still describe the eager start: the harness documentation says Janissary starts the Chromium at launch, says nothing restarts a dead browser and a later connect simply fails, and reads the 🌐 flag as a live-browser indicator; the tabs page repeats the flag claim; and the remote spec says a remote `-b` launch starts its own guard, its own browser and its own scratch directory together. A reader following any of them after this pull request is told the opposite of what now happens.

## Design decisions

1. **The endpoint is published at launch; the browser is not.** The user-facing consequence worth stating is the one that saves work: a `-b` tab whose AI never drives a browser never starts a Chromium at all, which is the whole point of the change and was invisible from the outside before.

2. **A later connect starts a fresh browser, and the old one's directory stays.** The restart is the behavior a reader is most likely to be misled about, and the kept scratch directory is the part that decides whether they go looking for evidence after the fact.

3. **The 🌐 flag follows the icon decision, not the other way round.** The flag is lit from launch for a `-b` tab, drops when a browser is reported gone, and does not come back when a later connect starts a replacement. Both pages that describe it say that, so the two agree with `product/specs/tabs.md` and with `src/tab/view.ts`.

4. **The remote starts its guard at spawn and its browser on the first connect.** The remote spec's claim is about *where* the machinery runs, which has not changed, and about *when*, which has. Only the when is corrected; the frame it reports a death through is untouched.

5. **The pages that are merely true stay untouched.** `remote-agents.md` says the browser runs on the remote host rather than on yours, which is still exactly what happens; `workspacing.md` says the browser is provided from outside the workspace and contained, which is also unchanged. Neither makes a claim about timing or restart, so neither is edited.

## What already exists (reuse, don't rebuild)

| Need | Existing precedent | Location |
| --- | --- | --- |
| The corrected statements, in spec form | the e2e section | `product/specs/harness.md`, End-to-end browser |
| The icon's actual contract | the Metadata row | `product/specs/tabs.md` |

## Proposed changes

1. **`documentation/user-documentation/advanced-agents/harness.md`.** "Giving a harness a browser": the two variables are published at launch and the Chromium starts on the harness's first connect, so a `-b` tab that never drives a browser never starts one; "Nothing restarts it, and a later connection attempt simply fails" becomes a later connect starting a fresh browser behind the same endpoint with its own state, with the dead one's scratch directory still kept; the 🌐 flag sentences describe the launch flag and the gone report rather than a live browser, in both the paragraph that introduces the flag and the one that says when it drops.

2. **`documentation/user-documentation/getting-started/tabs.md`.** The metadata-row sentence claiming the flag "always tells you whether there's a browser to connect to right now" is corrected to the launch flag and the gone report.

3. **`product/specs/remote-server.md`.** The paragraph beginning "The end-to-end browser moves it once more" says the remote starts its own guard at spawn, and its browser and scratch directory on the first connect from one of its own clients.

## Tests

None. These are documentation files with no assertions over them, and the check that they agree with the code is the grep below plus reading the four passages against the e2e section of `product/specs/harness.md`.

## Out of scope

- No change to `ai/guidelines/sandbox-e2e-browser.md` or `product/specs/harness.md`, which this pull request already corrected and which read correctly now that the connect genuinely waits.
- No change to `remote-agents.md` or `workspacing.md`, whose claims are still true.
- No new documentation for behavior nobody has written down.

## Verification

`./scripts/run.mjs check-diff`. Then grep `documentation/` and `product/specs/` for "Nothing restarts", "simply fails", "always tells you" and "starts a headless Chromium" and expect only the remaining true uses, if any.
