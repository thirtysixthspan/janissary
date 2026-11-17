# Show open errors in the dispatched command reply

**Complexity: 4/10** — one server flow threaded end to end: carry the invocation id through the open pipeline so its error lines are captured into the RPC reply (~35 added lines, 5 production files, 3 requirements, 5 scenarios, p=4.78).

## Goal

`open missing.txt`, `open javascript:alert(1)`, and `video notes.md` produce no visible reply in a shell tab. The server writes the error into the tab's transcript, but the shell renders only the RPC output, which comes back empty. Errors from commands routed through the file opener must reach the reply the same way `play: notes.md: not a playable file` already does.

## Root cause

`src/commands/open.ts` passes only `invocation?.runId` into `managers.openFile.run`, dropping the `invocationId` that `executeAndCapture` filters on. Downstream, `buildContext`'s `note`, the missing-file and pinned-opener refusals in `openOne`, the parse and glob refusals in `runOpenCommand`, and the plugin-opener origin all append with plain `managers.tab.append` and no invocation id. The capture in `src/command/manager.ts` therefore sees no matching `entry:appended` event and returns an empty `output`, even though the text exists in the tab's own buffer.

## Correct behavior

Any error the open pipeline raises while answering a dispatched command is included in that command's output, so the shell tab shows it beneath the echoed line. The same text stays in the transcript for tabs that render appended entries, and nothing moves to the notifications feed except the unsupported-extension error the spec already keeps there.

## Reproduction

Two failing tests in `src/controller.test.ts` call `c.managers.command.dispatchLineWithOutput` for `open /no/such/pic.png` and `open javascript:alert(1)` and assert the reply contains `no such file` and `invalid URL`. Both currently get `output: ''`, while the existing `allText(c)` assertions in the same file confirm the server does write the text into the tab. That isolates the loss to the capture seam, not to error production.

## Approach

Thread a narrow invocation reference (just `invocationId`) as an optional trailing argument through the open pipeline, without disturbing callers that have no invocation. Where a line is appended, use `appendForInvocation` when the id is present and plain `append` otherwise, matching `src/plugins/context.ts`. The same reference goes into the plugin opener origin so a web opener's `capabilities.note` is attributed too. This keeps one execution path and one capture seam; it does not widen `executeAndCapture` to swallow unrelated appends.

## Implementation steps

1. `src/open/types.ts` — add `OpenInvocation = { invocationId?: string }`, the narrow reference the open pipeline needs.
2. `src/open/file-manager.ts` — add a `note` helper that appends with `appendForInvocation` when an invocation id is present. Accept an optional trailing `OpenInvocation` in `run`, `runAs`, and `buildContext`; pass it into `buildContext` and into the plugin-opener origin (alongside the existing `runId`). Route the `note` callback and the two `openOne` refusals through the helper.
3. `src/open/file-command.ts` — replace its direct `managers.tab.append` calls for parse, pinned-opener, no-viewer, no-match, and truncated-glob messages with the context's `note`, so they inherit the same attribution. The context is already built with the display command and label.
4. `src/commands/open.ts` — pass the full `invocation` as the new trailing argument instead of only `runId`.
5. `src/plugins/invoke.ts` — pass `{ invocationId: origin.invocationId }` as the trailing argument on both `runAs` paths so pinned-opener refusals from plugin commands are captured.
6. `src/plugins/selection.test.ts` — extend the `runAs` call assertion with the new trailing argument.
7. Update `product/specs/open.md` so the error-surfacing section states that these messages appear in the command reply as well as the transcript.

## Regression test

The two `src/controller.test.ts` cases from Reproduction are the regression guard. They fail with `output: ''` against the current code and pass once the invocation id reaches the appends. Existing `src/open/file-manager.test.ts` cases keep the no-invocation path on plain `append`, so they guard against attribution changing unrelated callers.

## Verification

Automated: `$janissary/scripts/run.mjs check-diff` passes, including both new tests and the existing open and plugin suites.

Live E2E: start a scratch instance, open a shell tab, type `open missing.txt`, then `open javascript:alert(1)`, and read the replies under each echoed line. The driver records the visible body text; it must contain a not-found message naming the missing path and an invalid-address message naming the URL. If the start task cannot build here or the browser is unavailable, record the reason and skip the live check.

## Out of scope

- Changing what the errors say or where the unsupported-extension notice goes. The spec keeps that one in the notifications feed.
- Widening `executeAndCapture` to collect every un-attributed append on the tab. That would pull unrelated background lines into a command's reply.
- Threading invocation ids through unrelated open callers (`edit`, `newfile`, file-navigator activations). Their appends either do not report errors or already use `appendCommandOutput`.
