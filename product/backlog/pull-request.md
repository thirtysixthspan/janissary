<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Share one builder for the remote-serve command string instead of maintaining a second copy for the capture query.

Existing Issue: `remoteCaptureCommand` in `src/remote/entry-factory.ts` reconstructs the same `janus remote-serve` invocation `remoteServeCommand` builds directly above it — same optional path interpolation, same `$SHELL -ic` wrapping, same quoting — differing only by three prepended `ssh -o` flags. Severity: 3/10

Existing Risk: 3/10 - A fix to how the remote path is quoted or how the remote shell is invoked lands in one of the two and not the other, so the detached capture query starts failing against exactly the addresses the fix was written for, and the only test pinning the capture variant is an exact-string assertion that would be updated to match whichever copy the author was looking at.

Proposal Risk: 1/10 - One builder, but its options parameter has to keep the default path byte-identical or every existing caller's command string changes silently.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1161: share one remote-serve command builder between launch and capture". In `src/remote/entry-factory.ts`, factor the `janus remote-serve${address.path ? ` ${address.path}` : ''}` construction and the `'$SHELL -ic "…"'` wrapping into one internal helper, and express `remoteCaptureCommand` as `remoteServeCommand` with the non-interactive ssh options applied — for example by giving the shared builder an options argument carrying the extra `-o` flags, defaulting to none so `remoteServeCommand`'s output is unchanged. Keep both exported names: `remoteServeCommand` is re-exported through `src/remote/manager.ts` and imported by callers and tests, and `remoteCaptureCommand` is what `queryParkedCapture` in `src/harness/capture-remote.ts` uses. The two exact-string assertions in `src/remote/manager.test.ts` — the `remoteServeCommand` describe block and the `remoteCaptureCommand` one added by this change — are the regression net for this refactor and must both keep passing with their expected strings untouched; if either has to change, the refactor has altered a command line and is wrong.
