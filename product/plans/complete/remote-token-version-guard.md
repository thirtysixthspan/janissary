# Stop a remote launch losing the forwarded GitHub token in silence

**Complexity: 3/10** — one constant bumped, one small pure module added and wired into the provisioning answer, focused tests, and spec/documentation updates. No new protocol frames and no change to the injection chain.

## What trying it out found

The reported symptom is that `harness opencode on anonymouscoward@10.27.1.94:dev/janissary` produces a harness with no access to the local machine's `GH_TOKEN`. On master the forwarding chain is intact — verified, not reasoned about:

- A cross-process reproduction ran a real child `janus remote-serve <root>` against a real `RemoteChannel`, with the local token loaded through `loadGithubToken`/`getGithubToken` exactly as `RemoteManager` loads it. The remote's workspaced process came back reporting `GH_TOKEN=LOCAL_MACHINE_TOKEN` and a `GH_CONFIG_DIR` inside the remote workspace's own `.tmp` directory. The remote project's own token (`REMOTE_MACHINE_TOKEN`) was correctly not the one used.
- The same reproduction with the remote configured `sandboxWorkspaces: false` — the shape of any host where isolation is inactive — produced the same result, confirming the `github-token-without-sandbox` fix.

So the code on this machine is right, and the failure is a skew between the two installations. That skew is invisible, and that is the actual defect.

`REMOTE_PROTOCOL_VERSION` is still `1`. It was not bumped when `githubToken` was added to the `provision` frame (commit 29a60183, `fix(remote): forward GitHub token to workspaces`). A remote installed before that commit therefore:

1. announces version 1, which this build accepts,
2. decodes the provision frame — `decodeFrame` hands the record through unchanged, extra fields and all,
3. reads only `frame.label` and drops `frame.githubToken` on the floor,
4. falls back to its own `.janissary/github-token`, which on a remote checkout normally does not exist,
5. provisions the workspace and runs the harness perfectly.

Nothing anywhere reports a problem. The tab opens, opencode runs, and the credential is simply absent — which is the reported symptom exactly. The remote named in the report is the same `anonymouscoward` host that co-authored the forwarding commit itself, so its `janus` predating that commit is the ordinary case, not an exotic one.

The protocol already owns this failure: `parseHandshake` refuses a version it does not speak and says "Update janissary so both hosts match", and `product/specs/remote-server.md` lists that mismatch among the failures a remote launch can report. The version simply was not moved when the contract changed.

## Goal

A remote launch either uses the forwarded token or says why it does not. An installation too old to honour the forwarded token is refused at the handshake with the message that already exists, and a remote that falls back to its own token — or has none at all — says so in the tab as it opens.

## Approach

Two parts, both small.

**The version guard.** Bump `REMOTE_PROTOCOL_VERSION` from 1 to 2. Version 1 is the contract without token forwarding; version 2 is the contract with it. Every mismatched pair now fails loudly at the handshake instead of degrading to a workspace that cannot push, and the existing message tells the user precisely what to do. Nothing else about the frames changes — the bump is what makes the existing `githubToken` field a *promise* rather than a hint.

**The credential notice.** `workspace-ready` already carries a `notice` string, and it is already the channel for facts only the remote knows (its isolation state). Which credential the remote's workspace ended up with is another such fact, so it travels the same way rather than adding a field: the remote composes its notice from the isolation notice and a GitHub-credential notice, joined with `; `. Following `sandboxNotice`'s own contract, the credential notice is present only when there is something to say — quiet when the forwarded token is in use, spoken when the remote fell back to its own token or has none. No local plumbing changes at all: `RemoteLaunchState.notice` and `finishSpawn` already thread and render whatever the remote sends.

## Implementation steps

1. `src/remote/protocol.ts` — bump `REMOTE_PROTOCOL_VERSION` to `2`, and extend the constant's comment to say that a frame gaining a field both ends must agree on is a version change, naming token forwarding as the change version 2 carries.
2. `src/remote/serve-notice.ts` (new) — two pure functions: `githubTokenNotice(forwarded, own)` returning the notice for a workspace that is not using a forwarded token (or `undefined` when it is), and `workspaceReadyNotice(...notices)` joining the present notices with `; ` and returning `undefined` when there are none.
3. `src/remote/serve.ts` — resolve the effective token once in `provision`, hand it to `RemoteProcesses` as now, and build the `workspace-ready` notice through `workspaceReadyNotice(sandboxNotice(), githubTokenNotice(...))`.
4. `src/remote/serve-notice.test.ts` (new) and additions to `src/remote/serve.test.ts` and `src/remote/protocol.test.ts` — the tests below.
5. `product/specs/remote-server.md` — state that the protocol version covers what the frames carry as well as their shape, so an installation predating token forwarding is refused at the handshake rather than silently ignoring the token; and describe the credential notice.
6. `product/specs/workspaced-agent.md` — note in "GitHub authentication" that a remote workspace reports when the forwarded token is not what it is using.
7. `documentation/user-documentation/advanced-agents/workspaced-agent.md` — the page promises forwarding works without saying both installations must be recent enough for it; add that a too-old machine on either end is refused with a version-mismatch message, and that the tab says when the forwarded token is not the one in use.

## Tests

`src/remote/serve-notice.test.ts`:

- A forwarded token produces no GitHub notice.
- No forwarded token but a token configured on the remote produces a notice naming the remote's own token.
- Neither token produces a notice saying nothing was injected for `git push`/`gh`. It reports what janissary did rather than predicting a failure: on a host without isolation nothing scrubs the environment, so an ambient token of the remote user's own may still be present.
- Neither spoken notice contains a semicolon, since that is what the notices are joined on.
- `workspaceReadyNotice` joins two present notices with `; `, passes a single one through, and returns `undefined` when every notice is absent.

`src/remote/serve.test.ts`:

- A `provision` frame carrying a `githubToken` answers with a `workspace-ready` whose notice has no `github token:` clause.
- A `provision` frame carrying no token, against a root with no token file, answers with a `workspace-ready` whose notice does carry one. (Both assert on the clause's presence rather than the whole string, so neither depends on whether the machine running the test has isolation available.)

`src/remote/protocol.test.ts`:

- A handshake announcing version 1 — every installation predating token forwarding — is refused, with the error naming both versions.

Run `./scripts/run.mjs check-diff` after each step.

## Out of scope

- Any change to `src/sandbox/index.ts`, `src/github-token.ts`, `src/remote/manager.ts`, or `src/remote/serve-processes.ts` — the load, forward, and inject chain is correct and was verified end-to-end before this plan was written.
- A capability negotiation richer than the version constant (feature flags in the handshake, per-frame capability checks). One version number is the mechanism this protocol has, and it is enough for a contract with one implementation on each side.
- Backwards compatibility with version 1 remotes. A remote that cannot honour the forwarded token cannot be made to; refusing it is the fix, not a regression to soften.
- Shipping, updating, or version-checking the remote installation itself — the remote stays a peer installation the user maintains.
- The tab surfacing the *local* side's token state; a local project with no token is already visible where it matters (nothing to forward, and the local workspaced tabs behave the same way).
