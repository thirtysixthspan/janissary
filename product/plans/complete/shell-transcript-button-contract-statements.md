# Shell transcript button in the plugin spec and the wire contract

**Complexity: 1/10** — prose in two specs and one protocol comment; the behavior they describe is already implemented and pinned by existing tests, so no code changes.

## Summary

The pull request review for #1675 recorded: *"Update the two contract statements that still say only a harness tab has a transcript button, now that the shell tab draws one and the renamed RPC serves it."*

`openTranscriptFileFor` (`src/controller/transcript.ts`) resolves a harness tab's session transcript from its tailer and otherwise the shell tab's `transcript` path from its tab record, and the shell plugin's metadata row sends it through the `openTranscript` action the host supplies once that path exists (`web/src/plugins/api.ts`). Two contract statements predate that:

- `product/specs/tab-plugins.md`, the shell plugin's chrome paragraph, ends "What it omits is the transcript control, because the terminal replaced the transcript."
- The comment above the `openTranscriptFileFor` member in `src/protocol/core-rpc.ts` describes it as opening a harness tab's session transcript from the harness metadata row, no-opping when the tab has no transcript tailer.

A sweep of `product/specs/`, `documentation/`, `help.md`, and the code comments in `src/` and `web/src/` for any other statement that a shell or plugin tab has no transcript control found none that says so. `product/specs/tabs.md` § the metadata row describes the clipboard button for harness tabs only, while its user-documentation counterpart (`documentation/user-documentation/getting-started/tabs.md`) already says shell tabs carry it too; that spec paragraph gains one sentence so the two agree. The other comments mentioning the transcript button (`src/controller/transcript.ts`, `src/controller/recording.ts`, `web/src/plugins/api.ts`, `web/src/plugins/shell/ShellTabMeta.tsx`, `src/protocol/plugin.ts`) are already current.

## Approach

Correct the prose to match the code. Nothing executable changes.

## Implementation steps

1. `product/specs/tab-plugins.md`, the paragraph beginning "The tab's chrome is the application's" — replace "What it omits is the transcript control, because the terminal replaced the transcript." with a sentence saying the row also draws an **Open transcript** button once the host supplies the transcript path, opening the shell's plain-text transcript (see [[shell-tab]] § Text transcript).
2. Same spec, the paragraph on recorded terminals ("It is also the only plugin whose terminals are **recorded**") — add that a recorded terminal also gets that text transcript, under the same gate.
3. `product/specs/tabs.md`, the metadata-row paragraph on the harness clipboard button — add that shell tabs show the same button, opening the shell's text transcript, drawn once that file has opened.
4. `src/protocol/core-rpc.ts` — rewrite the comment above `openTranscriptFileFor` to say it opens the named tab's transcript file in an editor tab: a harness tab's session transcript from its tailer, otherwise a shell tab's text transcript from its tab record; triggered by the clipboard button in a harness or shell tab's metadata row; no-ops when neither exists.

## Tests

No new test: the change is prose and a comment. The existing `src/controller/transcript.test.ts` pins the resolution order the new comment describes, and `src/client-message.test.ts` and `src/message/handler-exhaustive.test.ts` cover the method's wiring; they stay green unchanged.

## Specs and documentation

`product/specs/tab-plugins.md` and `product/specs/tabs.md` as above. `help.md` and `documentation/user-documentation/` already describe the shell tab's **Open transcript** button and need no change.

## Out of scope

- Any change to `openTranscriptFileFor`, the shell metadata row, or the host's `openTranscript` action.
- The pull request description and title.
