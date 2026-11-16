# Keep the search provider keys out of spawned process environments

**Complexity: 4/10** — ~40 added lines in three production files, six requirements and eight test scenarios, four new units (p=5.20).

## Goal

Neither `TAVILY_API_KEY` nor `TINYFISH_API_KEY` may appear in the environment of any process Janissary spawns, whether the value came from a token file or from the server's own ambient environment. The search still works everywhere it did: `web search` reads the keys from `getProjectTokens()` in the Janissary server process, and a remote search reads them from the provisioning map on the far side.

Today `src/sandbox/environment.ts` sets both variables from a configured token row because `tokenVariables` walks every row, so every workspaced shell, harness, and ACP agent gets them, as does every ACP agent outside a workspace through `agentCredentialEnv`. No spawned process reads either key. The two row comments in `src/project/tokens.ts` say so outright. A compromised or prompt-injected harness can read the values and burn the user's Tavily or TinyFish quota, or reach the provider account.

An ambient value is the second half of the problem. Neither name is on `ENV_SCRUB_PATTERNS`, so a confined workspaced spawn passes an exported value through intact, and the pass-through path scrubs nothing at all.

After the fix, the two rows carry a new `spawn: false` column, `tokenVariables` skips those rows, the names join `ENV_SCRUB_PATTERNS`, and the pass-through path drops them in `withWorkspaceCredentials`.

## Approach

1. **`src/project/tokens.ts` — the row opt-out.** Add an optional `spawn` column to the table, defaulting to true through an exported `ProjectTokenRow` type and an `isSpawnedCredential(row)` helper. Set `spawn: false` on the `tavily` and `tinyfish` rows and rewrite their comments: the search runs in the Janissary process, which reads the key through `getProjectTokens()`, so no spawned process is handed it. Leave `loadProjectTokens` and the loader untouched.

2. **`src/sandbox/environment.ts` — skip the rows.** Iterate `PROJECT_TOKENS` as rows in `tokenVariables` and skip one whose `isSpawnedCredential` is false, alongside the existing missing-value and `include(name)` checks. `workspaceCredentialEnv` and `agentCredentialEnv` both call it, so neither sets the two variables any more. Update the comments on `workspaceCredentialEnv`, `agentCredentialEnv`, and `tokenVariables` to name the opt-out.

3. **`src/sandbox/environment.ts` — the pass-through path.** Derive `serverOnlyVariables` from the rows that are not spawned, and add a small `withoutServerOnlyCredentials(env)` that returns the environment minus those names when any is present. Call it from `withWorkspaceCredentials` before merging the added credentials. This covers a workspaced spawn on a host with no confinement, and an outside-workspace ACP agent, which `connectAcp` spawns with its working directory as the workspace directory. Do not widen it to every scrubbed variable: the pass-through path deliberately leaves the rest of the environment alone.

4. **`src/sandbox/paths.ts` — the confined path.** Add `/^TAVILY_API_KEY$/` and `/^TINYFISH_API_KEY$/` to `ENV_SCRUB_PATTERNS`, and extend the comment above it: the scrub still exempts LLM provider keys, but the search keys are credentials no spawned process reads, so they are scrubbed like any other secret a spawn cannot use.

5. **Leave untouched:** `loadProjectTokens`, `getProjectTokens`, the provisioning forwarding in `src/remote/serve-provision.ts` and `src/remote/frame/decode-provision.ts`, the `RemoteFileNavigators` and `RemoteAcp` token maps, the protocol version and its comment, the provider capability and every search provider, and `src/acp/index.ts`. The far-side Janissary process keeps searching with the forwarded token or its own file.

## Design decisions

1. **An optional column with a default, not a field on every row.** `spawn` is absent on the five rows a spawn reads and `false` on the two it does not. The helper makes the default explicit in one place, and a future row that a spawned process needs stays a row-plus-variable edit. Writing `spawn: true` on every harness row would be noisier without being safer: `isSpawnedCredential` is the single predicate both `tokenVariables` and the ambient removal consult.

2. **The opt-out changes injection only.** Loading and forwarding stay exactly as they were, so a configured search token still reaches `webSearch` locally and through the far-side `web-search` operation. The two rows keep their `env` lists because the table still records which variables the credential would be set under, and the ambient removal derives its names from those lists.

3. **Both paths, with one mechanism each.** The confined path already runs `scrubEnv` over the caller's environment, so `ENV_SCRUB_PATTERNS` is the right lever there. The pass-through path scrubs nothing by design (see `product/specs/sandbox.md`), so `withWorkspaceCredentials` drops only the server-only names. Extending the scrub to that path would change what every ambient variable does on a non-confining host, which is a separate decision and not this fix.

4. **A deliberate revision of the feature's own token decision.** The canonical plan's "Tokens on each host" decision recorded that the two variables are set in every environment the table's credentials reach because every non-GitHub row's are. That was a defect, not a requirement: no spawned process reads either key. This repair revises that paragraph, and the spec and documentation sentences that repeat it, to the delivered rule. The canonical plan's title and its `Complexity: 8/10` rating stay as they are, and this plan records the revision.

## Implementation steps

1. Edit `src/project/tokens.ts`: add the `spawn` column, the `ProjectTokenRow` type, and `isSpawnedCredential`; mark the two search rows and rewrite their comments.
2. Run `$janissary/scripts/run.mjs check-diff`.
3. Edit `src/sandbox/environment.ts`: skip non-spawned rows in `tokenVariables`, derive `serverOnlyVariables`, add `withoutServerOnlyCredentials`, call it from `withWorkspaceCredentials`, and update the comments.
4. Run `$janissary/scripts/run.mjs check-diff`.
5. Edit `src/sandbox/paths.ts`: add the two patterns and extend the scrub comment.
6. Run `$janissary/scripts/run.mjs check-diff`.
7. Update `src/project/tokens.test.ts` with the two-row opt-out assertion.
8. Update `src/sandbox/environment.test.ts`, `src/sandbox/harness-spawn.test.ts`, and `src/sandbox/index.test.ts` for the new expectations and the absence cases.
9. Run `$janissary/scripts/run.mjs check-diff`.
10. Update `product/specs/sandbox.md`, `product/specs/workspaced-agent.md`, `product/specs/remote-server.md`, `product/specs/acp.md`, and `product/specs/web-search.md`.
11. Update `documentation/user-documentation/advanced-agents/tokens.md` and `documentation/developer-documentation/web-search-providers.md`.
12. Update `product/plans/complete/web-search.md`: the "Tokens on each host" decision, the `src/project/tokens.ts` entry, the `PROJECT_TOKEN` reuse row, the spec-edit summary, and the test-inventory clause that says both variables are injected.
13. Run `$janissary/scripts/run.mjs check-diff` one last time.

## Tests

- **`src/sandbox/environment.test.ts`** — the harness-token mapping loses the two search rows; a new case passes `{ tavily, tinyfish }` to `agentCredentialEnv` and expects `{}`; a new case passes every credential to `workspaceEnv` and expects the harness variables but neither search variable; a new case calls `withWorkspaceCredentials` with a configured search token and expects neither variable; a new case calls it with an ambient search key plus `NPM_TOKEN` and expects only the search key gone on the pass-through path.
- **`src/sandbox/harness-spawn.test.ts`** — "injects every configured credential" keeps both search tokens in its input but expects neither variable; the scrub case adds `TAVILY_API_KEY` and `TINYFISH_API_KEY` to the dropped list; a new case builds with both search tokens configured and expects neither variable.
- **`src/sandbox/index.test.ts`** — the unconfined workspaced test expects neither search variable even when both tokens are configured; the "leaves the rest of an unconfined environment alone" case gains ambient search keys and keeps its other assertions, now pinning that only the two are removed.
- **`src/project/tokens.test.ts`** — a new case asserts exactly `tavily` and `tinyfish` are not spawned, so a row that silently defaults back to spawned fails.
- **Existing coverage that must keep passing untouched:** `src/remote/serve-file-navigator.test.ts`'s typed web search case, which runs `webSearch` with `{ tavily: 'tvly-key' }` on the operation context, and `src/remote/serve-acp-loop.test.ts`'s far-side search with workspace tokens. Together they are the proof that a configured token still reaches the far-side operation. `src/remote/serve-provision.test.ts` stays untouched.

## Out of scope

- The provider capability, the search core, both bundled providers, and every search suite.
- `loadProjectTokens`, the provisioning frame, `decode-provision`, and the `RemoteFileNavigators` and `RemoteAcp` token maps.
- `REMOTE_PROTOCOL_VERSION` and its comment: the two names stay in the provisioning map.
- Plain non-workspaced shells and other spawns that never take a workspace credential; their environment stays the user's own.
- Scrubbing any variable other than the two search keys on the pass-through path.
- The other entries in `product/backlog/pull-request.md`.
