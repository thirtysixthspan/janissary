# Forward the Claude token to remote workspaces

**Complexity: 4/10** — one new optional field on an existing frame, a protocol version bump, the load/forward/inject chain already built for the GitHub token, and the spec and documentation that currently say this doesn't happen. No new architecture; the shape is copied from `forward-github-token-to-remote-workspaces.md`.

A workspaced `claude` harness gets its subscription token from `.janissary/claude-token`, injected as `CLAUDE_CODE_OAUTH_TOKEN` into every workspaced spawn. That works locally. It stops at the machine boundary: `RemoteProcesses` is constructed with a GitHub token and nothing else, and `runRemoteServer` calls `loadGithubToken` alone, so a remote workspace has no Claude credential from either side. The harness signs in from the remote's own Keychain, or not at all.

Not at all is the common case. Isolation and the Keychain both need macOS, and the hosts people put remote agents on are mostly Linux, where the sandbox denies `~/.claude/.credentials.json` outright. So the exact machine that most needs a forwarded token is the one guaranteed not to have a local fallback. The GitHub token already crosses this boundary; this makes the Claude token cross it the same way.

## Approach

**Forward it on the `provision` frame.** `ClientFrame`'s `provision` variant gains `claudeToken?: string` beside `githubToken`. `RemoteManager` fills it from `getClaudeToken()` at the same point it fills the GitHub one. The token is never written to the remote filesystem; it lives in the frame and then in the spawned processes' environment.

**Fall back to the remote's own file.** `runRemoteServer` calls `loadClaudeToken(resolved.root)` alongside `loadGithubToken`, and `provision` resolves `forwardedClaudeToken ?? ownClaudeToken` exactly as it already does for GitHub. A remote project that configures its own token keeps working when the initiating project has none.

**Bump `REMOTE_PROTOCOL_VERSION` to 3.** The constant's own comment sets the rule: it covers what the frames carry, not only their shape, because an end that ignores a field it was expected to honor looks healthy while doing the wrong thing. A version-2 remote decodes the new frame happily, drops `claudeToken`, provisions, and runs a harness that reports itself logged out. Refusing it at the handshake is the same call that was made when `githubToken` was added, and the version-mismatch message already names both versions.

**Pass the two tokens as one `credentials` object.** `RemoteProcesses`'s constructor currently ends in `githubToken?: string`. Adding `claudeToken?: string` after it puts two adjacent optional strings in a positional signature, where transposing them type-checks cleanly and silently sends each token to the wrong place. The constructor takes `credentials: { github?: string; claude?: string }` instead, which also mirrors how `SandboxOptions` already names them.

**No credential notice for the Claude token.** `githubTokenNotice` exists because a missing GitHub token is invisible until a `git push` fails much later. A missing Claude credential is not invisible: the harness says so in its own output as soon as it starts. A mirrored notice would also fire on the common case, since most remote launches have no Claude token configured on either machine and are working exactly as intended, so it would add a line to the ordinary tab rather than warning about anything.

## Implementation steps

1. `src/remote/protocol.ts` — add `claudeToken?: string` to the `provision` variant. Bump `REMOTE_PROTOCOL_VERSION` to `3` and extend the constant's comment with what version 3 is (the contract in which the remote must also use a forwarded Claude token).
2. `src/remote/serve-processes.ts` — replace the `githubToken` constructor parameter with `credentials: { github?: string; claude?: string }`, and pass `claudeToken` into both the `spawnPty` and `spawnShell` sandbox options beside `githubToken`.
3. `src/remote/serve.ts` — import and call `loadClaudeToken(resolved.root)` next to `loadGithubToken`; take `frame.claudeToken` through `dispatch` into `provision`; resolve it against `getClaudeToken()` and hand both tokens to `RemoteProcesses` as the new `credentials` object. Leave `workspaceReadyNotice`/`githubTokenNotice` untouched.
4. `src/remote/manager.ts` — send `claudeToken: getClaudeToken()` on the `provision` frame.
5. `product/specs/remote-server.md` — update "What is computed where" so the credential paragraph covers both tokens, and extend the version-mismatch rationale in "Failures" to name this second field.
6. `product/specs/workspaced-agent.md` — the "Harness authentication" section currently states the token is not forwarded. Replace that with the forwarding behavior and the remote-side fallback.
7. `documentation/user-documentation/advanced-agents/tokens.md` — rewrite the "The Claude token is not forwarded" half of "How tokens reach a remote".
8. `documentation/user-documentation/advanced-agents/remote-agents.md` — replace the paragraph saying the Claude token isn't forwarded.

## Tests

- `src/remote/protocol.test.ts`: a `provision` frame carrying both tokens round-trips through `encodeFrame`/`decodeFrame` with both intact; a handshake announcing version 2 is refused, naming both versions (the existing version-1 test's reasoning now covers two fields).
- `src/remote/serve-processes.test.ts`: a PTY spawn and a pipe spawn each receive `claudeToken` in their sandbox options alongside `githubToken`, from the one `credentials` object.
- `src/remote/serve.test.ts`: a `provision` frame carrying a `claudeToken` provisions a workspace whose processes get that token; a `provision` frame with no `claudeToken` falls back to the remote's own configured token; neither case adds a notice line to `workspace-ready`.

## Out of scope

- **A credential notice for the Claude token** — see the Approach note.
- **`ENV_SCRUB_PATTERNS`, sandbox carve-ins, and the `.claude/.credentials.json` deny.** The env var is the supported way past that deny and the deny stays correct.
- **Any UI or command for creating either token file.** Janissary still only reads them.
- **The GitHub token's own forwarding, notice, and fallback**, which work and are not what this changes.
- **Backward compatibility with a version-2 remote.** Refusing it is the point; both ends update together.

## Verification

Automated: `./scripts/run.mjs check-diff` after each step.

Manual: with a token from `claude setup-token` in `.janissary/claude-token`, run `harness claude on <linux-host>` and confirm the harness starts authenticated rather than logged out, and that a remote still running the previous release is refused at the handshake with the version message.
