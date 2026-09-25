# Make the metadata-row browser icon mean what the shipped lazy start does

**Complexity: 2/10** — prose in two specs, two test names, and one code comment. Nothing in the derivation changes: `src/tab/view.ts` already reads `tab.browser && !tab.harness?.browserError`, and the only question is what that is honestly called.

## Summary

The plan behind this pull request asserted the globe icon needed no change because it "tracks the browser the moment it starts". It does not: `tab.browser` is set from the `-b` launch flag at spawn and `browserError` is written once and never cleared, so a `-b` tab shows a browser from launch before one exists, and never shows one again after a death even though the next connect starts a fresh browser behind the same endpoint. Both specs state the stronger claim. At this size the honest resolution is to make the documentation match the behavior rather than to invent a signal the server does not publish.

## Design decisions

1. **The icon tracks the launch flag, and the spec says so.** A `-b` tab is lit from the moment it opens — which is what the user asked for when they ticked the box — and a tab without one is never lit. The band above the terminal and the notifications line are where a browser's death is reported, and neither is the icon's job.

2. **The icon drops on a gone report and does not come back.** `browserError` is written once and never cleared, so a replacement browser started by a later connect leaves the row dark under a tab whose endpoint is serving a working browser again. Stating that plainly is what keeps the next reader from reading it as a bug in the restart path, which it is not.

3. **Making it track a live browser is a new signal, and that is a plan's decision, not this fix's.** It needs a browser-started event beside the browser-gone one, a field beside `browserError` in the tab's view, a writer for local tabs, and a new frame for a remote tab's far-side browser — and this pull request's plan rules a new frame type out. That route goes back through the plan; the spec records it so the decision is written down rather than inferred from an icon.

4. **The test names change, the assertions do not.** Two cases in `src/tab/view.test.ts` describe the icon as a browser being "attached" and "gone", which is the claim being corrected. Their assertions stay exactly as they are, because the derivation they pin has not changed.

## What already exists (reuse, don't rebuild)

| Need | Existing precedent | Location |
| --- | --- | --- |
| The derivation the specs have to describe | `tab.browser && !tab.harness?.browserError` | `src/tab/view.ts:67` |
| Where a browser's death is reported, and what a replacement does to it | the connect-triggered paragraphs | `product/specs/harness.md`, End-to-end browser |

## Proposed changes

1. **`product/specs/tabs.md`.** The Metadata row paragraph beginning "The browser flag reports the browser the tab has" is rewritten to state the icon is lit from launch for a `-b` tab, drops when a browser is reported gone, and does not return when a later connect starts a replacement, with the band and the notification line carrying the death. The flag list's own gloss — "shown while the tab has a headless browser attached" — is the same claim in the same section and is corrected with it. The paragraph ends by naming what a live-browser icon would need, so the next reader does not have to guess why it reads the way it does.

2. **`product/specs/harness.md`.** The paragraph ending "The icon disappears on the same update that raises the gone-browser band above the terminal" gains the same clause about a later connect, so the two specs cannot disagree.

3. **`src/tab/view.ts` and `src/tab/view.test.ts`.** The comment on the flag drops "the tab *has* a browser" for the launch flag, and the two cases are renamed from "attached"/"gone" to the launch flag and the gone report. No assertion changes.

## Tests

- The two renamed cases in `src/tab/view.test.ts`, unchanged in substance: a `-b` tab's row carries the flag, and the flag drops when the harness view reports a browser gone.
- Nothing else. This is a documentation correction, and the honest test for it is that the two specs now say the same thing as `src/tab/view.ts`.

## Out of scope

- No new `onBrowserStarted` signal, no new view field, no new remote frame, and no change to the icon's derivation.
- No change to the band, the notification, or the report a death produces.

## Verification

`./scripts/run.mjs check-diff`, and a read of the two spec paragraphs against `src/tab/view.ts:67`.
