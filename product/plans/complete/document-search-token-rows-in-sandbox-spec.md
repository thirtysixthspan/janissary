# Document the search token rows in the sandbox spec

**Complexity: 1/10** — no production lines or files, two documentation requirements, one verification scenario (p=2.61)

`PROJECT_TOKENS` in `src/project/tokens.ts` gained `tavily` and `tinyfish` rows, but the environment section of `product/specs/sandbox.md` still inventories only the five credentials that existed before them. Its credential narration ends at the Gemini key's two variables and names neither `TAVILY_API_KEY` nor `TINYFISH_API_KEY`, and its scrub discussion explains only the LLM provider keys as deliberately unmatched, so a reader auditing what a workspaced process can see concludes the two search keys are either not injected or scrubbed away.

## Goal

The environment section of `product/specs/sandbox.md` names `TAVILY_API_KEY` and `TINYFISH_API_KEY` alongside the five credentials it already inventories. It states where their token files are read from — the project's `.janissary/` before `~/.janissary/` — that they are set for every workspaced spawn on the confined and pass-through paths alike, and that the search runs in the janissary process rather than in the spawned one. It also records that neither variable is matched by `ENV_SCRUB_PATTERNS`, so an ambient value survives the scrub and a configured token file takes precedence, without claiming the list deliberately exempts them. No code, test, or other spec file changes.

## Approach

Insert one new paragraph in the "Environment scrubbing" section, after the sentence describing the Gemini key's two variables and before the sentence beginning "Four more variables are added for every workspaced spawn". The paragraph names both files, both variables, `loadProjectTokens` in `src/project/tokens.ts`, the project-before-home order, the confined and pass-through reach, and the split between the janissary process running the search and the spawned process receiving the variable. Its closing sentence carries the scrub fact: neither variable matches `ENV_SCRUB_PATTERNS` in `src/sandbox/paths.ts`, so an ambient value survives and a configured token file takes precedence in `workspaceCredentialEnv`. It stops there rather than joining the deliberate LLM-provider exemption, which is a claim about intent that the table does not make for these rows.

The paragraph reads:

> A Tavily API key configured at `.janissary/tavily-token` and a TinyFish API key configured at `.janissary/tinyfish-token` (both read by `loadProjectTokens` in `src/project/tokens.ts`, with the project's `.janissary/` consulted before `~/.janissary/`) are set as `TAVILY_API_KEY` and `TINYFISH_API_KEY` for every workspaced spawn, on the confined and pass-through paths alike. The search itself runs in the janissary process rather than in the spawned one, so the two variables reach a spawned environment only because every non-GitHub row in that table does. Neither variable is matched by `ENV_SCRUB_PATTERNS` in `src/sandbox/paths.ts`, so an ambient value survives the scrub and a configured token file takes precedence over it in `workspaceCredentialEnv`.

The surrounding sentences, including the git-identity paragraph that follows and the rest of the scrub section, stay byte-for-byte unchanged.

## Implementation steps

1. In `product/specs/sandbox.md`, insert the paragraph above between "... other than the ambient environment." and "Four more variables are added for every workspaced spawn ...", with one blank line on each side.
2. Re-read the new paragraph against all seven `PROJECT_TOKENS` rows in `src/project/tokens.ts` — `github`/`GH_TOKEN`, `claude`/`CLAUDE_CODE_OAUTH_TOKEN`, `opencode`/`OPENCODE_API_KEY`, `kilo`/`KILO_API_KEY`, `gemini`/`GEMINI_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY`, `tavily`/`TAVILY_API_KEY`, `tinyfish`/`TINYFISH_API_KEY` — and confirm the section names every one, so an eighth row would be visibly missing rather than silently absent.
3. Confirm `ENV_SCRUB_PATTERNS` in `src/sandbox/paths.ts` still matches neither search variable, and that `workspaceCredentialEnv` in `src/sandbox/environment.ts` overwrites an ambient value with a configured token.
4. Run `$janissary/scripts/run.mjs check-diff`.

## Tests

No executable tests. The change is documentation only and alters no behavior, type, or message, so no test can distinguish before from after. The behavior the paragraph describes is already covered by the table-driven cases in `src/project/tokens.test.ts` and `src/sandbox/environment.test.ts` and by the workspaced-spawn case in `src/sandbox/index.test.ts`; all three stay untouched and must keep passing. Verification is the seven-row reading in step 2, the scrub and precedence readings in step 3, and `$janissary/scripts/run.mjs check-diff` on the documentation-only diff.

## Spec

`product/specs/sandbox.md` — the environment section gains the two search credentials' token files, variables, reach, and scrub behavior, completing its inventory of all seven rows.

## Out of scope

- `src/sandbox/paths.ts`, `src/project/tokens.ts`, `src/sandbox/environment.ts`, and every other source file; the injection is already implemented and must not change.
- The table-driven cases in `src/project/tokens.test.ts` and `src/sandbox/environment.test.ts` and the workspaced-spawn case in `src/sandbox/index.test.ts`, which must keep passing untouched.
- The stale all-five-tokens harness spawn test and the other recorded backlog entry about it.
- `product/specs/workspaced-agent.md`, `product/specs/remote-server.md`, `product/specs/acp.md`, and `documentation/user-documentation/advanced-agents/tokens.md`, which the token-row change already updated.
- The stale `src/project-tokens.ts` references elsewhere in the sandbox spec's environment section.
