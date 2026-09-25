<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Run the remote root clone's ssh non-interactively, closing the functionality gap where an unanswerable ssh prompt hangs the launch.

Existing Issue: The root clone sets only `GIT_TERMINAL_PROMPT=0`, which does not reach ssh, so a clone over an scp or `ssh://` origin (the path taken whenever no GitHub token is forwarded) lets ssh open the remote's controlling terminal for a host-key confirmation or key passphrase that renders in the placeholder while the placeholder's keystrokes are dropped after the handshake. Severity: 5/10

Existing Risk: 6/10 - A fresh host with no `github.com` entry in its known_hosts, which is the host this feature exists for, shows ssh's "Are you sure you want to continue connecting" prompt that nothing can answer, and the launch hangs until the tab is closed instead of failing with a reason.

Proposal Risk: 2/10 - A host that relied on answering such a prompt interactively can no longer do so and gets a clone-failed line instead, which is the documented behavior for any credential the host lacks.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1200: run the remote root clone's ssh in batch mode so an unanswerable host-key or passphrase prompt fails the clone instead of hanging it". In `cloneCommand` in src/git/clone.ts, the `keepStderr` branch (the root clone started from `OfferRun` in src/remote/serve-root-offer.ts) sets `GIT_TERMINAL_PROMPT: '0'` only. Also set `GIT_SSH_COMMAND` to `ssh -o BatchMode=yes` there when the environment does not already define `GIT_SSH_COMMAND` (respect an existing value by appending the option rather than replacing it), so ssh fails at once with its own first error line. `ready` then rejects with it and the existing `clone-failed` refusal reports it. Leave the local `-w` clone (no `keepStderr`) untouched, since it runs where a terminal can answer. Extend src/git/clone.test.ts, using the existing spawn spy, to assert that a kept-stderr clone's environment carries the batch-mode ssh command and that a plain clone's does not. Update the "Missing clone" section of product/specs/remote-server.md with one sentence saying the root clone never waits on a prompt.


* Refuse to offer a home-directory clone into a dot-folder, closing the security gap where a crafted repository name targets a hidden configuration folder.

Existing Issue: `repositoryName` accepts any single folder name, so an origin whose last segment is `.ssh` or `.config` makes the home-directory flow offer to clone that repository into `~/.ssh` or `~/.config` whenever that folder is missing or empty. Severity: 4/10

Existing Risk: 3/10 - A launching project whose `origin` was rewritten by a malicious checkout could get a user to accept an offer that creates `~/.ssh` from attacker content, including an `authorized_keys`, though the prompt does show the target path.

Proposal Risk: 1/10 - A legitimate repository whose name begins with a dot can no longer be cloned through the no-path flow and needs an explicit path instead, which the refusal line says.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1200: refuse a home-directory clone target whose derived folder name starts with a dot". `repositoryName` in src/git/repository-url.ts validates the derived name only with `workspaceLabelError` from src/workspace/label.ts. Return `undefined` for a name beginning with `.` as well. `homeTarget` in src/remote/serve-root.ts then refuses with the existing `no-repo-name` kind and the existing wording in `rootRefusalMessage` (src/launch-name/messages.ts), so no protocol or message change is needed. Extend src/git/repository-url.test.ts with `https://github.com/o/.ssh` and `git@github.com:o/.config.git` returning `undefined`, and src/remote/serve-root.test.ts with a no-path launch for such an origin refusing as `no-repo-name` while an explicit missing path still offers. The existing `repositoryName` accept cases must keep passing.


* Cover the harness and agent launch wiring for root refusals and root clones with tests, closing the technical-debt gap where the new failure and notice paths ship untested end to end.

Existing Issue: `onRootRefused` in `startRemoteLaunch` and the `reportRemoteClone` calls in `startRemoteTab` and `startRemoteAgent` have no test, while the sibling leftover-cleanup wiring has tests in the harness and profile suites, so the path from a `root-refused` or `cloned` frame to the placeholder and the notifications feed is only exercised in pieces. Severity: 4/10

Existing Risk: 4/10 - A refactor that drops the `onRootRefused` handler or one `reportRemoteClone` call would silently restore the old "could not check <host>" line or lose the cloned notice for one of the two launch kinds, and no test would fail.

Proposal Risk: 1/10 - Tests only; the risk is limited to a fixture that mirrors the harness mocks too closely to notice a wiring change.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1200: test the root-refusal and root-clone wiring through the harness and agent remote launch paths". Mirror the existing leftover-cleanup wiring tests: the `launch-workspace-cleaned` cases in src/harness/manager.test.ts and src/profile/remote-agent.test.ts show how each suite drives a remote launch's handlers. Add, for both a harness launch (`startRemoteTab` in src/harness/remote-launch.ts) and an agent launch (`startRemoteAgent` in src/profile/remote-agent.ts), one case where the channel handlers receive `onRootRefused` with a `declined` refusal. It should assert the composed `Cannot launch "<name>": … clone declined.` line is shown (the harness `provisionError` or the agent `out` line) and posted as `launch-refused` to the creator. Add one case where `onReady` receives a `cloned` record and `launch-root-cloned` is posted with `Cloned <url> into <path> on <host>.`. No production change is expected; if a case fails, fix the wiring it exposes.


* Update the pull request description to cover the clone-URL guard and the credential scrubbing added after it was written, closing the description-fidelity gap.

Existing Issue: The description predates the two follow-up commits: it never mentions that an origin starting with `-` or using an `ext::`/`fd::` transport is refused before git runs, that every clone now passes `--` ahead of its URL, or that refusals strip embedded credentials from the other origin and git's error line, and its file list omits `cloneUrlError`, `withoutCredentialsIn`, and the two added plan files. Severity: 3/10

Existing Risk: 3/10 - A reviewer judging the security boundary from the description does not know the injection guard and the scrubbing exist, so a later change that removes either would not be recognized as a regression.

Proposal Risk: 1/10 - Only the description changes; the risk is an edit that disturbs paragraphs the author wrote, which the proposal limits to additions.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1200: describe the clone-URL guard and the refusal credential scrubbing in the pull request description". This is a description correction delivered by the work-an-issue PR-mode description step, not a file change. In the "What" section, after the paragraph on the forwarded GitHub token, add sentences stating that `startGitClone` (src/git/clone.ts) refuses a URL starting with `-` or using the `ext::`/`fd::` command transports before spawning git, reported as the clone-failed line, and passes `--` ahead of the URL. Also state that the `different-origin` and `clone-failed` refusals carry the other origin and git's error line with embedded credentials removed (src/remote/serve-root.ts, src/remote/serve-root-offer.ts). In "Files changed", add `cloneUrlError` and `withoutCredentialsIn` to the `git/repository-url.ts` line, `--` and the refusal to the `git/clone.ts` line, and the two plan files product/plans/complete/guard-clone-url-injection.md and product/plans/complete/scrub-credentials-from-root-refusals.md to "Specs and docs". Leave every other paragraph as written and do not touch the title.


* Name the cloned-root record type once instead of repeating its shape, closing the technical-debt gap the diff creates across the protocol and launch layers.

Existing Issue: The `{ url: string; path: string }` record for a cloned root is written out inline in the protocol's `workspace-ready` frame, the launch handler type, the launch state, the failure funnel, the offer result, the settle result, and the decoder, rather than declared once and imported. Severity: 2/10

Existing Risk: 2/10 - A field added to the cloned record, such as the branch cloned, has to be threaded through every inline copy by hand, and a copy that is missed still typechecks wherever it is only read.

Proposal Risk: 1/10 - A type-only change the compiler checks at every site, so nothing it misses can survive typecheck.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1200: declare the cloned-root record type once and import it everywhere it is used". Export `ClonedRoot = { url: string; path: string }` beside `RootRefusal` in src/remote/root-refusal.ts, a pure type module every user already reaches. Replace the inline shapes with it in the `workspace-ready` member of `ServerFrame` in src/remote/protocol.ts, `RemoteLaunchHandlers.onReady` in src/remote/manager.ts, `RemoteLaunchState.cloned` and the local state in src/harness/remote-launch.ts, `reportRemoteClone` in src/launch-name/fail-remote.ts, `RootOfferResult` in src/remote/serve-root-offer.ts, `SettledRoot` in src/remote/serve-root-settle.ts, the `provisionRemoteWorkspace` parameter in src/remote/serve-provision.ts, and the `Cloned` alias in src/remote/frame-decode-root.ts. Behavior does not change; typecheck plus the existing protocol, manager, and fail-remote tests confirm it.


* Give the remote tests a workspace manager instead of letting the entry factory tolerate a missing one, closing the technical-debt gap where a required dependency is read as optional.

Existing Issue: `provisionOrigin` in the remote entry factory reads `managers.workspace?.origin()` although `Managers.workspace` is required, only because several test harnesses build a `Managers` without it, so production code silently sends no origin when the dependency is absent. Severity: 2/10

Existing Risk: 3/10 - If a real construction path ever lacks the workspace manager, launches quietly stop sending the origin and every remote root is accepted without the clone-of-this-project check, with no error to notice.

Proposal Risk: 1/10 - Only test fixtures and one operator change, and a harness still missing the manager fails loudly rather than silently.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1200: add a workspace manager to the remote test harnesses and drop the optional chaining on managers.workspace". In src/remote/entry-factory.ts, change `managers.workspace?.origin()` in `provisionOrigin` to `managers.workspace.origin()`. Add `workspace: { origin: () => undefined }` to each `Managers` fixture that creates a remote channel without one: `managerHarness` and `browserHarness` in src/remote/manager.test.ts, the setup in src/remote/attach.test.ts, and the fixtures in src/sessions/agent-roundtrip.test.ts and src/sessions/harness-roundtrip.test.ts, plus any other suite that fails with "Cannot read properties of undefined (reading 'origin')" once the operator is removed. The `rootHarness` cases in src/remote/manager.test.ts already supply one and pin the origin behavior.
