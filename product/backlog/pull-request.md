<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Document the two new failure outcomes of the screen-capture command in the user documentation, which still lists only the errors that predate this change.

Existing Issue: The capture section of `documentation/user-documentation/advanced-agents/harness.md` gained a paragraph about detached-query failures but still lists `No tab labeled "<name>".` as the outcome when no tab has the label — now only true when no persisted session record matches either — and names neither the ambiguous-label refusal nor the reconnecting refusal that `captureSubcommand` and `resolveOpenRemoteCapture` can now return. Severity: 3/10

Existing Risk: 3/10 - A user who hits `Multiple detached sessions are labeled "<name>"` finds nothing about it in the reference page that claims to enumerate this command's errors, and files it as a bug rather than as the deliberate refusal it is.

Proposal Risk: 1/10 - The page lists every outcome, and the remaining exposure is only that a future error string added in code has to be mirrored here by hand.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1161: document the new harness capture failure outcomes". In `documentation/user-documentation/advanced-agents/harness.md`, under "Capturing a harness's screen", the bulleted error list sits immediately above the detached-query paragraph this change added. Amend the `No tab labeled "<name>".` bullet to say it applies when neither an open tab nor a persisted detached session record carries the label, and add two bullets for the strings `captureSubcommand` and `resolveOpenRemoteCapture` in `src/harness/subcommands.ts` now return: `Multiple detached sessions are labeled "<name>". Attach the intended session before capturing.` and `No capture available for "<name>" — connection is reconnecting.` Add a sentence stating that a session detached from the Sessions tab can still be captured by the label it was recorded under, since a deliberate Detach closes the tab and the page currently reads as though a capture needs an open one. Keep the wording aligned with `product/specs/harness.md`, which already describes all three cases — that spec is the source of truth here, and the documentation page is the user-facing restatement of it. No code changes and no test changes belong in this item.


* Share one builder for the remote-serve command string instead of maintaining a second copy for the capture query.

Existing Issue: `remoteCaptureCommand` in `src/remote/entry-factory.ts` reconstructs the same `janus remote-serve` invocation `remoteServeCommand` builds directly above it — same optional path interpolation, same `$SHELL -ic` wrapping, same quoting — differing only by three prepended `ssh -o` flags. Severity: 3/10

Existing Risk: 3/10 - A fix to how the remote path is quoted or how the remote shell is invoked lands in one of the two and not the other, so the detached capture query starts failing against exactly the addresses the fix was written for, and the only test pinning the capture variant is an exact-string assertion that would be updated to match whichever copy the author was looking at.

Proposal Risk: 1/10 - One builder, but its options parameter has to keep the default path byte-identical or every existing caller's command string changes silently.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1161: share one remote-serve command builder between launch and capture". In `src/remote/entry-factory.ts`, factor the `janus remote-serve${address.path ? ` ${address.path}` : ''}` construction and the `'$SHELL -ic "…"'` wrapping into one internal helper, and express `remoteCaptureCommand` as `remoteServeCommand` with the non-interactive ssh options applied — for example by giving the shared builder an options argument carrying the extra `-o` flags, defaulting to none so `remoteServeCommand`'s output is unchanged. Keep both exported names: `remoteServeCommand` is re-exported through `src/remote/manager.ts` and imported by callers and tests, and `remoteCaptureCommand` is what `queryParkedCapture` in `src/harness/capture-remote.ts` uses. The two exact-string assertions in `src/remote/manager.test.ts` — the `remoteServeCommand` describe block and the `remoteCaptureCommand` one added by this change — are the regression net for this refactor and must both keep passing with their expected strings untouched; if either has to change, the refactor has altered a command line and is wrong.
