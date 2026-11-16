# Scope the search-key plan's goal to workspaced and ACP spawns

**Complexity: 1/10** — no production code changed, no production files edited, one requirement (p=2.07).

## Goal

`product/plans/complete/keep-search-keys-out-of-spawned-environments.md` opens by promising that neither `TAVILY_API_KEY` nor `TINYFISH_API_KEY` may appear "in the environment of any process Janissary spawns, whether the value came from a token file or from the server's own ambient environment". The delivered guarantee is narrower. A workspaced shell, harness, or ACP agent loses both keys, and `connectAcp` passes its working directory as the workspace directory, so every ACP agent is covered. A plain non-workspaced spawn keeps the user's own environment: `withWorkspaceCredentials` returns its input untouched when `workspaceDir` is absent (`src/sandbox/environment.ts`), and `sandboxSpawn` passes that result through for a spawn with no workspace directory (`src/sandbox/index.ts`). The plan's own Out of scope bullet already says so, which leaves its opening sentence claiming more than the code keeps.

The fix replaces the Goal's first sentence with a claim scoped to the spawns that take a workspace or ACP credential, and states in the same paragraph that a plain non-workspaced spawn keeps the user's own environment, matching the existing Out of scope bullet. Nothing else in the plan changes.

## Approach

Edit one paragraph: the Goal's first sentence. Name the spawns that take the credential — a workspaced shell, harness, or ACP agent — as the ones that cannot carry either key, whether the value came from a token file or from the server's ambient environment. Add the counterpart in the same paragraph: a plain non-workspaced spawn keeps the user's own environment, which repeats the existing Out of scope bullet rather than introducing a new rule. Leave the rest of the Goal, every design decision, the implementation steps, the tests, and the Out of scope section byte-for-byte unchanged.

Verify the scoped sentence against the code before writing it. `tokenVariables` skips a row whose `isSpawnedCredential` is false, so `workspaceCredentialEnv` and `agentCredentialEnv` inject neither key. `withoutServerOnlyCredentials` drops an ambient copy on the pass-through path inside `withWorkspaceCredentials`, which returns its input untouched when `workspaceDir` is absent. `sandboxSpawn` returns that credential result unchanged for a spawn with no `workspaceDir`. `connectAcp` passes `options.workspaceDir ?? options.cwd` as the sandbox workspace directory, so an ACP agent is always a workspace-directory spawn. The existing cases in `src/sandbox/environment.test.ts`, `src/sandbox/harness-spawn.test.ts`, and `src/sandbox/index.test.ts` pin the workspaced and ACP behavior, and no case asserts removal from a plain non-workspaced spawn.

## Design decisions

1. **Scope the goal to the credential-taking spawns.** The delivered guarantee follows the credential: only a spawn that takes a workspace or ACP credential is handed the removal, so a plain spawn keeps the user's environment. A goal that says "any process Janissary spawns" promises a scrub that does not run for a plain tab, and a reader who trusts it either builds on the missing scrub or reads the delivered workspaced and ACP coverage as incomplete.

2. **State the plain-spawn behavior in the same paragraph.** Putting the boundary beside the scoped sentence keeps a reader from drawing the broader conclusion before reaching Out of scope. The bullet stays where it is; the paragraph points at it instead of duplicating a rule in two framings.

3. **Change nothing but that paragraph.** The implementation steps, design decisions, tests, and Out of scope describe the delivered behavior and stay as written. The Goal's first sentence is the only statement that overreaches.

4. **No code, test, spec, help, or user documentation change.** The delivered behavior is correct and already covered; this repair corrects the plan's description of it. Adding coverage for a plain spawn would change what the feature guarantees, which is a different decision.

## Implementation steps

1. Read the Goal and Out of scope sections of `product/plans/complete/keep-search-keys-out-of-spawned-environments.md` and confirm the overbroad sentence and the plain-spawn bullet are present.
2. Verify the boundary in `src/sandbox/environment.ts` (`tokenVariables`, `agentCredentialEnv`, `withWorkspaceCredentials`, `withoutServerOnlyCredentials`), `src/sandbox/index.ts` (`sandboxSpawn`), `src/acp/index.ts` (`connectAcp`), and the named cases in `src/sandbox/environment.test.ts`, `src/sandbox/harness-spawn.test.ts`, and `src/sandbox/index.test.ts`.
3. Replace the Goal's first sentence with the scoped claim and add the plain-spawn sentence to the same paragraph, leaving the paragraph's remaining sentence about the search still working unchanged.
4. Run `$janissary/scripts/run.mjs check-diff`.
5. Remove the resolved entry from `product/backlog/pull-request.md`, restoring its comment-and-heading skeleton when it was the only entry.
6. Confirm with `git diff` that the only changes are the Goal paragraph in the canonical plan and the backlog removal.

## Tests

No automated tests. The change is prose in one plan file plus a backlog removal, so there is no test surface. Run `$janissary/scripts/run.mjs check-diff` after the edits; the command must exit 0.

Manual verification: read the Goal paragraph and confirm it scopes the guarantee to a workspaced shell, harness, or ACP agent and names the plain non-workspaced spawn's own environment; confirm with `git diff` that the implementation steps, design decisions, tests, and Out of scope section are unchanged, and that the backlog file holds only its leading comment and `# pull-request` heading.

## Spec and documentation

No spec, help, or user documentation change. The behavior was delivered with the feature and is already described; this repair corrects the plan's claim about it.

## Out of scope

- Changing any other line of `product/plans/complete/keep-search-keys-out-of-spawned-environments.md`.
- Changing code, tests, specs, help pages, or user documentation.
- Adding a plain-spawn case to the plan's Tests section or to any test file.
- Resolving anything else on the branch.
