# Correct the search-key exposure claims in the pull request description and token page

**Complexity: 1/10** — 0 added production lines, 0 production files, 0 requirements (p=1.578); two prose edits, one user page and one description sentence.

## Goal

The pull request body's What section and the "How a token reaches a workspace" section of `documentation/user-documentation/advanced-agents/tokens.md` both say the two search provider keys reach spawned processes. Neither does. The security repair marked both token rows `spawn: false`, so `tokenVariables` skips them for every workspaced and ACP credential map, and the pass-through and confined spawn paths drop an ambient copy as well. A reviewer reading the description, or a user reading the token page, cannot tell that the two search rows behave differently from the five that spawn, which makes the repaired boundary easy to misread and easy to undo.

After the fix both artifacts say what the code does. The Janissary process that runs the search reads the keys, they travel to a remote in the provisioning map, and neither is injected into a spawned shell, harness, or ACP agent.

## Approach

1. **`documentation/user-documentation/advanced-agents/tokens.md` — name the tokens that do reach a tab.** The first paragraph of "How a token reaches a workspace" says Janissary "hands the values to each workspaced tab's processes" and the second says "A token reaches the tab". Both read as covering all seven files, so qualify the first to the GitHub token and the four harness tokens and state that the two search keys stay in the Janissary process that runs `web search`; qualify the second to those same spawned tokens.

2. **The pull request body's What section — one sentence, no change-set statistics.** The sentence that begins "Tokens are read from" ends by saying the keys are "exposed as `TAVILY_API_KEY` and `TINYFISH_API_KEY` like every other harness credential". Rewrite it to say the Janissary process that runs the search reads the keys, they travel to a remote in the provisioning map, and neither key is injected into a spawned shell, harness, or ACP agent. Drop the "That means" sentence that carried the old claim.

3. **Leave everything else as it is.** The page's opening caveat that the two search tokens configure the process rather than a tab already agrees with the code, and so does the "How tokens reach a remote" paragraph. The description's other paragraphs are the author's statement of intent and stay byte-for-byte. No code, test, spec, help page, or title change.

## Design decisions

1. **Say "injected", not "never present".** The token files no longer seed either variable into a spawn, but a plain non-workspaced shell keeps the user's own ambient environment, which the repair plan's Out of scope deliberately leaves alone. "Injected" is the claim the code keeps and the one the old sentence got wrong.

2. **Name both kinds of spawned credential on the page.** The GitHub token is not one of the page's four "harness tokens" (it stays workspace-only), but it does reach a workspaced tab's processes along with them. Naming only the harness tokens would leave the GitHub token's journey unstated, so the paragraph names the GitHub token and the four harness tokens, then sets the search keys apart.

3. **One sentence in the description.** Replacing the old sentence and its "That means" follow-up with one corrected sentence keeps the paragraph's flow and makes the old claim impossible to misread as still standing.

## Implementation steps

1. Edit `documentation/user-documentation/advanced-agents/tokens.md`: in "How a token reaches a workspace", change "then hands the values to each workspaced tab's processes as they launch" to "then hands the GitHub token and the four harness tokens to each workspaced tab's processes as they launch", add a sentence saying the two search keys stay in the Janissary process that runs `web search`, and change "A token reaches the tab" to "Those tokens reach the tab".
2. Run `$janissary/scripts/run.mjs check-diff`.
3. After the push, rewrite the description sentence in the What section that begins "Tokens are read from" so it carries the corrected claim, and drop the "That means they get forwarded … like every other harness credential" sentence. Leave every other description paragraph unchanged.
4. Apply the revised body with `gh pr edit <reference> --body-file ./temp/pr-body.md`.

## Tests

None, and none possible: the artifacts are prose in a pull request body and a user page, and the behavior they describe is already pinned by `src/sandbox/environment.test.ts`, `src/sandbox/harness-spawn.test.ts`, `src/sandbox/index.test.ts`, and `src/project/tokens.test.ts`. `$janissary/scripts/run.mjs check-diff` still runs to confirm the documentation edit breaks nothing.

## Verification

- `src/project/tokens.ts`: both search rows set `spawn: false`; `isSpawnedCredential` is the predicate every injection path consults.
- `src/sandbox/environment.ts`: `tokenVariables` skips a non-spawned row, `agentCredentialEnv` therefore never carries a search key, and `withWorkspaceCredentials` drops an ambient copy through `withoutServerOnlyCredentials`.
- `src/sandbox/paths.ts`: `ENV_SCRUB_PATTERNS` matches both search variable names on the confined path.
- `src/remote/serve-provision.ts`: the merged `{ ...own, ...forwarded }` map still carries both keys to the far-side Janissary process.
- `product/specs/sandbox.md`, `product/specs/workspaced-agent.md`, and `product/specs/acp.md` already state that no spawned process reads either key, that the keys travel in the provisioning map, and that a remote search reads them on the far side. The revised prose must agree with those sections sentence for sentence.

## Spec and docs

`product/specs/sandbox.md`, `product/specs/workspaced-agent.md`, and `product/specs/acp.md` already describe the delivered boundary correctly, so this fix changes no spec for its own part and only corrects user documentation and the pull request description. `product/specs/web-search.md` did not agree: its Tokens section said the key never enters any spawned environment, which overclaimed the boundary for a plain non-workspaced spawn. That sentence is scoped to workspaced and ACP spawns by `product/plans/complete/scope-search-key-claim-to-workspaced-spawns.md`.

No help page change: `help/` does not describe token injection or either search token file.

## Out of scope

- Any code, test, or spec change.
- The page's opening caveat, its token table, its other token sections, and the "How tokens reach a remote" paragraph.
- The pull request title and every description paragraph other than the one named above.
- Plain non-workspaced shells and other spawns that never take a workspace credential; their environment stays the user's own.
- The other entry in `product/backlog/pull-request.md`.
