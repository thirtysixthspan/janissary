# Pass a Gemini API key to local and remote workspaced tabs

**Complexity: 3/10** — the fourth token through a chain that already carries three, with no step that has not been taken twice before. The whole design question is whether to keep copying the pattern or collapse it first; see "The duplication" below.

Denying `~/.local/share/opencode/auth.json` closed the last route a workspaced opencode harness had to its Google provider key. The documented replacement is exporting `GEMINI_API_KEY` in the environment janissary starts from, which works but is the only credential in the system that has to be managed that way — every other one is a file in `.janissary/`. That is an inconsistency the user notices at exactly the wrong moment, when a workspaced tab has just stopped authenticating and the fix lives somewhere other than where the other three fixes live.

`.janissary/gemini-token` closes it, on the same terms as the other three.

## Approach

**Copy the opencode token, step for step.** New `src/gemini-token.ts` reads `.janissary/gemini-token` and caches it, loaded in `main.ts` and in `runRemoteServer`. `SandboxOptions` gains `geminiToken`, injected as `GEMINI_API_KEY` by `workspaceCredentialEnv`. The `provision` frame gains `geminiToken`, sent by `RemoteManager` and resolved on the far side against the remote's own file. `RemoteProcesses`'s `credentials` object gains `gemini`.

**`GEMINI_API_KEY` and not the alternatives.** The `google` provider accepts `GOOGLE_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, or `GEMINI_API_KEY`, all equivalent. Injecting one is enough, and a file named `gemini-token` that sets anything other than `GEMINI_API_KEY` would be a small surprise every time someone reads it. The other two keep working from the environment for anyone who prefers them, unchanged and still exempt from the scrub.

**Bump `REMOTE_PROTOCOL_VERSION` to 5.** Same rule as the three bumps before it, stated on the constant: the version covers what the frames carry, so a field one end fills and the other is expected to honor moves it. A version-4 remote drops `geminiToken` and provisions a tab whose Google provider cannot authenticate — the same silent-success failure the rule exists to prevent.

This is the third breaking bump in a short span, and worth saying plainly rather than burying in a footer: anyone running remote tabs has to update both ends again. The alternative, making this token local-only to avoid the bump, would leave the one credential a remote opencode harness most needs stranded on the wrong machine, which is a worse trade than one more coordinated upgrade.

**Not added to `ENV_SCRUB_PATTERNS`.** `GEMINI_API_KEY` matches no current pattern and should not: it is an LLM provider key, and the scrub deliberately exempts those. An ambient value keeps passing through, and a configured file takes precedence over it in the environment janissary builds — same as the other two provider tokens.

## The duplication, and why this plan does not fix it

With this change there are four near-identical twenty-line loader modules, and adding a token touches nine files across the local and remote chain. That was already flagged as a follow-up when the third one landed, and a fourth makes the case stronger, not weaker.

It stays a follow-up anyway. Collapsing the loaders into a table is the easy half; the half that matters is that the `provision` frame carries one named field per token, so a real fix changes the frame to carry a map — a protocol change, a fifth version bump of its own, and a rewrite of the fallback resolution on the serve side. Doing that *and* adding a token in one change means a failure in either one looks like a failure in the other. The refactor deserves its own plan, its own bump, and its own diff to review; this plan deliberately leaves the pattern worse-but-consistent rather than half-migrated.

## Implementation steps

1. `src/gemini-token.ts` — `loadGeminiToken`, `getGeminiToken`, module-level cache, mirroring `src/opencode-token.ts`. The comment names what consumes it and why the file exists: opencode's own credential store is denied inside a workspace, so this is the Google provider's route in.
2. `src/main.ts` — call `loadGeminiToken(cwd)` beside the other three loaders.
3. `src/sandbox/index.ts` — add `geminiToken?: string` to `SandboxOptions` with a comment; add the conditional spread to `workspaceCredentialEnv` and update that function's comment from "three tokens" to four.
4. `src/shell-manager.ts`, `src/pseudoterminal-manager.ts`, `src/acp/index.ts` — pass `geminiToken: <workspaced> ? getGeminiToken() : undefined`.
5. `src/remote/protocol.ts` — add `geminiToken?: string` to the `provision` variant; bump `REMOTE_PROTOCOL_VERSION` to `5` and extend the constant's comment.
6. `src/remote/serve-processes.ts` — `credentials` gains `gemini?: string`, passed into both the PTY and pipe sandbox options.
7. `src/remote/serve.ts` — `loadGeminiToken(resolved.root)` at startup; take `frame.geminiToken` through `dispatch` into `provision`; resolve against `getGeminiToken()`.
8. `src/remote/manager.ts` — send `geminiToken: getGeminiToken()` on the `provision` frame.
9. `product/specs/sandbox.md` — add the fourth variable to "Environment scrubbing".
10. `product/specs/workspaced-agent.md` — extend the opencode paragraph: the Google provider now has a token file rather than only an environment variable, and the Vertex caveat is unchanged.
11. `product/specs/remote-server.md` — add the fourth token to the credential paragraph and the version rationale.
12. `documentation/user-documentation/advanced-agents/tokens.md` — fourth row in the file table, a short section on obtaining the key, and the provider-variable table updated so it no longer implies the environment is the only route.
13. `documentation/user-documentation/advanced-agents/remote-agents.md` — fold the fourth token into the credential paragraph.

## Tests

- `src/gemini-token.test.ts` (new, mirroring `src/opencode-token.test.ts`): trimmed token when the file exists and cached for `getGeminiToken`; `undefined` when missing; `undefined` when empty.
- `src/sandbox/index.test.ts`: injects `GEMINI_API_KEY` on a confined workspaced spawn; still injects it on the unconfined pass-through path; leaves an ambient value alone when no token is configured; all four credentials land together when all four tokens are given.
- `src/remote/protocol.test.ts`: a `provision` frame carrying all four tokens round-trips intact; a handshake announcing version 4 is refused, naming both versions.
- `src/remote/serve-processes.test.ts`: PTY and pipe spawns both receive `geminiToken` from the one `credentials` object.
- `src/remote/serve.test.ts`: a forwarded `geminiToken` reaches the spawned process and adds no notice; with none forwarded, the remote's own configured token is used.

## Out of scope

- **Collapsing the four token loaders and the per-token frame fields** — see "The duplication" above.
- **`GOOGLE_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY` token files.** One file per provider, not one per accepted alias.
- **Google Vertex.** It authenticates from `GOOGLE_APPLICATION_CREDENTIALS`, a path to a file the sandbox denies; a token file cannot fix that, and widening the deny to reach the file is what the deny exists to prevent.
- **A credential notice on the remote side**, for the reason the other two provider tokens have none: an unauthenticated provider surfaces in the harness's own output, and most launches will have no Gemini token configured and be working as intended.
- **`ENV_SCRUB_PATTERNS`** — the patterns are correct as they stand.

## Verification

Automated: `./scripts/run.mjs check-diff` after each step, plus `npm run docs:build`.

Manual: with a key in `.janissary/gemini-token` and no `GEMINI_API_KEY` exported, open a workspaced opencode harness and confirm a `google/…` model answers; repeat with `harness opencode on <host>` against an updated remote.
