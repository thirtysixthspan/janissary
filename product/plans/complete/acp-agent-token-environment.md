# Hand token-file credentials to ACP agents outside a workspace

Issue: auth tokens must be placed in the environment for opencode to access when called using ACP.

Complexity rating: 3/10

## Goal

An ACP agent launched by Janissary gets the credentials from the `.janissary/` token files in its environment wherever it runs. Today `connectAcp` passes the project's tokens to the sandbox only when the session has a `workspaceDir`, and `withWorkspaceCredentials` returns the environment untouched without one. So a monitor session, or an `ask`/role session on a tab with no workspace, starts `opencode acp` with no `OPENCODE_API_KEY`, `KILO_API_KEY`, or Gemini key even though `~/.janissary/opencode-token` (or a sibling) is configured. An opencode that was never signed in with `opencode auth login` then fails to authenticate, and the ask role falls through to its next model.

## Approach

Keep workspaced sessions exactly as they are: the sandbox already injects every token, including `GH_TOKEN` with its `GH_CONFIG_DIR` redirect.

For a session with no workspace, `connectAcp` merges the harness credentials into the environment it hands `locateAcpCommand` and `sandboxSpawn`. The harness credentials are every `PROJECT_TOKENS` row except `github`, each under every variable its row names, so the gemini key still lands as both `GEMINI_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY`. The GitHub token is left out: outside a workspace there is no private `gh` config directory to redirect to, and a `GH_TOKEN` would replace the user's own `gh` login for an unconfined process that never needed one.

Order of precedence, lowest to highest: the server's environment, the token-file credentials, the launch's own `env` (`OPENCODE_CONFIG_CONTENT`, `ANTHROPIC_MODEL`, …). A token file overriding an exported variable matches what a workspaced tab already does and what the token documentation promises.

The mapping lives beside `workspaceCredentialEnv` in `src/sandbox/environment.ts`, which already walks `PROJECT_TOKENS`; both share one helper that takes the rows to include, so the table stays the single source of which variable each credential becomes.

## Implementation steps

1. In `src/sandbox/environment.ts`, extract the row walk from `workspaceCredentialEnv` into a `tokenVariables(tokens, include)` helper and add an exported `agentCredentialEnv(tokens)` that includes every row except `github`.
2. In `src/acp/index.ts`, resolve the tokens once (`options.tokens ?? getProjectTokens()`), build the requested environment as the harness credentials (non-workspaced only) followed by `options.env`, pass `{ ...process.env, ...requested }` to `locateAcpCommand`, and keep passing the tokens to `sandboxSpawn` only for a workspaced session.
3. Update the `tokens` comment on `AcpOptions` in `src/acp/types.ts` to say a session outside a workspace receives the harness credentials directly.

## Tests

- `src/sandbox/environment.test.ts` (new): `agentCredentialEnv` maps claude, opencode, kilo, and gemini tokens to their variables (gemini to both); leaves out the GitHub token and `GH_CONFIG_DIR`; returns an empty object for no tokens.
- `src/acp/index.test.ts` (`connectAcp — credentials`): record the environment handed to `sandboxSpawn`. A session with no workspace and an explicit token map gets `OPENCODE_API_KEY`, `KILO_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, and `CLAUDE_CODE_OAUTH_TOKEN` from it, not the GitHub token, and passes no tokens to the sandbox options; the launch's own `env` overrides a credential variable of the same name; a workspaced session still hands the tokens to the sandbox and not pre-merged into the environment.

## Out of scope

- Non-workspaced harness and shell PTY tabs, which still receive no token-file credentials.
- The ChatGPT OAuth bridge, which stays workspace-only.
- Remote ACP sessions, which always run in a provisioned workspace and already receive forwarded tokens.

## Specs and docs

- `product/specs/acp.md`: under Provider and model, an agent outside a workspace receives the harness token files' credentials in its environment; the GitHub token stays workspace-only.
- `product/specs/workspaced-agent.md`: the token-file section notes the harness credentials also reach ACP agents outside a workspace.
- `documentation/user-documentation/advanced-agents/tokens.md`: the same in user terms, under "How a token reaches a workspace".
