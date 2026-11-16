# Scope the web-search spec's search-key claim to workspaced and ACP spawns

**Complexity: 1/10** — 0 production lines, 0 production files, 0 requirements (p=1.578); two prose edits, one spec sentence and one repair-record sentence.

## Goal

The Tokens section of `product/specs/web-search.md` says the search key "never enters a spawned shell, harness, or ACP agent's environment". The delivered boundary is narrower. `tokenVariables` skips the two `spawn: false` rows, and `withWorkspaceCredentials` drops an ambient copy, but only when a spawn has a workspace directory. A plain non-workspaced spawn keeps the user's own environment, so a key exported there is still visible to it. The same paragraph in `product/specs/sandbox.md` and the Goal of `product/plans/complete/keep-search-keys-out-of-spawned-environments.md` already state the narrower rule exactly.

The stronger claim makes the delivered protection read as uncertain and hides the plain non-workspaced exposure behind a spec that says it cannot happen. After the fix the Tokens sentence says what the code does: the search runs in the Janissary process, which reads the key itself, so neither key is set in a workspaced shell, harness, or ACP agent's environment whether it came from a token file or the machine's own environment, while a plain spawn outside a workspace keeps the user's own environment.

A second record is wrong on the same subject. The Spec and docs section of `product/plans/complete/correct-search-key-exposure-claims.md` says no functional spec change was needed because the specs already describe the boundary correctly. `product/specs/web-search.md` did not, which is this item. The sentence is corrected so the repair record stops claiming the spec already agreed.

## Approach

1. **`product/specs/web-search.md` — scope the Tokens sentence.** Replace the last sentence of the Tokens section. Keep the paragraph's first four sentences and its remote merged-token sentence byte-for-byte. The replacement names the Janissary process as the key's only reader, scopes the guarantee to workspaced shell, harness, and ACP agent spawns, covers both origins the delivered rule handles (a configured token and an ambient copy), and states that a plain spawn outside a workspace keeps the user's own environment.

2. **`product/plans/complete/correct-search-key-exposure-claims.md` — record the spec gap.** Rewrite the Spec and docs sentence so it no longer says no functional spec change was needed. Name the three specs that already agreed, and record that `product/specs/web-search.md` overclaimed the boundary and was corrected by this plan.

3. **Leave everything else as it is.** No code, test, help page, user documentation, or other spec changes. Both `product/specs/sandbox.md` and the repair plan already describe the boundary correctly, so they are the wording to match, not files to edit.

## Design decisions

1. **Scope the sentence to the spawns the rule covers.** The delivered rule removes the keys on every path a spawned process takes with a workspace directory: the confined path through `ENV_SCRUB_PATTERNS`, the pass-through path through `withoutServerOnlyCredentials`, and the ACP spawn through its working directory used as the workspace directory. Saying "workspaced shell, harness, or ACP agent" matches that exactly, and naming the plain non-workspaced exception keeps the spec from claiming more than the code delivers.

2. **Say "set", not "never enters".** For a workspaced or ACP spawn the keys are genuinely absent, whether the value came from a token file or the ambient environment, which is what `product/specs/sandbox.md` says. "Set" carries the full guarantee for those spawns; "never enters a spawned shell" is the part that overreached, because it swept in spawns that take no workspace credential.

3. **A repair record may be corrected.** `product/plans/complete/correct-search-key-exposure-claims.md` is the record of the documentation half of the security repair. Its Spec and docs sentence made a factual claim that turned out false, so the record is corrected rather than left to mislead a later reader about which specs were checked.

4. **No description change.** The pull request body carries no claim about the search keys entering a plain non-workspaced spawn; the earlier repair already corrected its What sentence to say neither key is injected into a spawned shell, harness, or ACP agent. Nothing in the body needs to change for this item.

## Implementation steps

1. Edit `product/specs/web-search.md`: replace the final sentence of the Tokens section with the scoped claim and the plain non-workspaced exception. Leave the remote merged-token paragraph unchanged.
2. Edit `product/plans/complete/correct-search-key-exposure-claims.md`: rewrite the Spec and docs sentence to record the `product/specs/web-search.md` gap and this correction.
3. Run `$janissary/scripts/run.mjs check-diff`.

## Tests

None, and none possible: the change is two prose sentences, and the behavior they describe is already pinned by `src/sandbox/environment.test.ts` (workspaced credentials omit both keys, a configured token adds neither on the pass-through path, and an ambient copy is dropped while the rest of the environment stays), `src/sandbox/index.test.ts` (a workspaced spawn injects neither key even with both tokens configured, confined or not), `src/sandbox/harness-spawn.test.ts` (the scrub list includes both names), and `src/project/tokens.test.ts` (exactly the two search rows are not spawned). `$janissary/scripts/run.mjs check-diff` still runs to confirm the prose edit breaks nothing.

## Verification

- `src/sandbox/environment.ts`: `tokenVariables` skips a row whose `isSpawnedCredential` is false, so `workspaceCredentialEnv` and `agentCredentialEnv` carry neither search key; `withoutServerOnlyCredentials` removes an ambient copy and `withWorkspaceCredentials` applies it only when `options.workspaceDir` is set, which is the plain non-workspaced exception the spec now names.
- `src/sandbox/index.ts`: `sandboxSpawn` routes a spawn with no `workspaceDir` through `withWorkspaceCredentials`, which returns the environment untouched, so a plain spawn keeps an exported key.
- `src/acp/index.ts`: the ACP spawn always supplies a workspace directory, falling back to its working directory, so the search keys are removed for an ACP agent inside or outside a workspace.
- `src/project/tokens.ts`: both search rows set `spawn: false` and `isSpawnedCredential` is the single predicate every injection path consults.
- `product/specs/sandbox.md` and `product/plans/complete/keep-search-keys-out-of-spawned-environments.md`: both already scope the guarantee to workspaced spawns and record the plain non-workspaced case in Out of scope. The revised sentence must agree with them sentence for sentence.
- Grep `product/specs/web-search.md` for "never enters" and confirm it is gone.

## Spec and docs

`product/specs/web-search.md` — the Tokens section's last sentence is scoped to workspaced shell, harness, and ACP agent spawns, gains the plain non-workspaced exception, and no longer claims a key never enters any spawned environment.

No help page or user documentation change: `help/web.md` states where the token files are read and does not describe spawned environments, and `documentation/user-documentation/advanced-agents/tokens.md` was already corrected to say the keys are not injected into a spawned shell, harness, or ACP agent.

## Out of scope

- Any code, test, or other spec change.
- The Tokens section's first four sentences and its remote merged-token paragraph.
- `product/specs/sandbox.md`, `product/specs/workspaced-agent.md`, `product/specs/acp.md`, and the repair plan: they already describe the delivered boundary.
- The pull request title and body.
- Making a plain non-workspaced spawn drop the keys; its environment stays the user's own by design.
- The other entries in `product/backlog/pull-request.md`.
