# Set `GOOGLE_GENERATIVE_AI_API_KEY` from `.janissary/gemini-token`

**Complexity: 2/10** — one column in the token table widens from a variable name to a list of them, and the single function that walks it sets each. No new module, no protocol change, no new credential.

A workspaced opencode harness pointed at a `google/…` model still fails to authenticate with a key in `.janissary/gemini-token`: opencode reports `GOOGLE_GENERATIVE_AI_API_KEY` is missing. The premise the gemini row was built on — that the Google provider reads `GOOGLE_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, and `GEMINI_API_KEY` interchangeably — holds for how opencode *detects* a configured provider but not for how it *calls* one: the provider SDK loads its key from `GOOGLE_GENERATIVE_AI_API_KEY` alone. So the token file made the provider look configured and then failed at the first request, which is the worse of the two failure modes.

The gap reaches further than the harness tab: the ACP agent runs `opencode acp` on `google/gemini-3.1-flash-lite`, so a workspaced ACP tab has been failing on exactly the same missing variable.

## Approach

**Inject the credential under both names.** `GEMINI_API_KEY` stays — it is what the file is named after, what the environment-scrub tests pin, what a shell inside the workspace is documented to receive, and what opencode's provider detection looks for. `GOOGLE_GENERATIVE_AI_API_KEY` is added beside it, because that is the one the request actually reads. One credential, two variables, no precedence question between them: the file's value wins over an ambient value of either name, exactly as it does today for one.

**A list column, not an alias exception.** `PROJECT_TOKENS`'s `env` becomes a list of variable names on every row rather than a single name on each. The alternative — an optional `aliases` column that only the gemini row carries — reads as a special case and, with the table declared `as const`, forces either an empty array on every other row or a presence check in the loop. A list says the true thing plainly: a row is a credential, and a credential is set under every name its consumer reads. `GH_CONFIG_DIR` stays the guarded line it is; it carries a path, not this credential under another name, and does not belong in the list.

**`GOOGLE_API_KEY` is deliberately not added.** It is a third accepted spelling for detection, not a third thing anything reads at call time. Two names is the number that makes the provider work; a third would only widen the surface a workspace's environment carries.

**No protocol version bump.** Nothing about the `provision` frame changes — the token still travels as `gemini` in the same map, and only the far end's environment assembly differs. A remote running the older code injects one variable instead of two, which is the bug this fixes rather than a new incompatibility, and the version rule covers what the frames carry.

## Implementation steps

1. `src/project-tokens.ts` — change `env` to a list of variable names on all four rows; give the gemini row `GEMINI_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY`. Rewrite that row's comment so it records what was actually learned: detection accepts three spellings, the request reads one, and this is why the row sets two. Update the table's own header comment where it says a row names a variable.
2. `src/sandbox/index.ts` — `workspaceCredentialEnv` sets every variable in a row's list rather than one, and its comment names the gemini row as the reason a row can carry more than one.
3. `product/specs/sandbox.md` — the gemini sentence in "Environment scrubbing" names both variables and why there are two.
4. `product/specs/workspaced-agent.md` — correct the Google-provider paragraph, which currently states that janissary injects only `GEMINI_API_KEY` and that the three spellings are equivalent to the provider.
5. `product/specs/remote-server.md` — the forwarded-credential paragraph lists both variables for the Gemini token.
6. `documentation/user-documentation/advanced-agents/tokens.md` — the "Get a Gemini key" section says the key arrives as both variables.
7. The same wrong claim, in the three places it is repeated about a key the *user* exports rather than one janissary injects: the environment hatch in `product/specs/workspaced-agent.md` and in `product/specs/sandbox.md`'s "Environment scrubbing", and the provider table in `documentation/user-documentation/advanced-agents/tokens.md`. All three currently offer `GOOGLE_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, or `GEMINI_API_KEY` as equivalent ways to reach a Google provider from a workspace, and the first and third do not survive a request on their own — exporting `GEMINI_API_KEY` by hand fails exactly the way the token file did. Each says which variable the request reads. This is the same defect as the fix itself, found in prose rather than in the table, and correcting the code while leaving the instructions wrong would strand anyone following them.

## Tests

- `src/project-tokens.test.ts`: every row declares at least one variable, and no variable name is claimed by two rows — the guard the widened column needs, table-driven like the loader test above it.
- `src/sandbox/index.test.ts`: a configured gemini token sets `GOOGLE_GENERATIVE_AI_API_KEY` as well as `GEMINI_API_KEY` on a confined workspaced spawn, and on the unconfined pass-through path; an ambient `GOOGLE_GENERATIVE_AI_API_KEY` is left alone when no token is configured; the all-four-credentials test asserts the second variable alongside the first.

## Out of scope

- **`GOOGLE_API_KEY`, and a token file per accepted spelling** — see "Approach".
- **Google Vertex.** Unchanged and still without a route into a workspace: it authenticates from a file path, not a key.
- **`ENV_SCRUB_PATTERNS`.** `GOOGLE_GENERATIVE_AI_API_KEY` is already exempt as an LLM provider key and already pinned by the scrub test.
- **The `provision` frame and `REMOTE_PROTOCOL_VERSION`** — see "Approach".

## Verification

Automated: `./scripts/run.mjs check-diff` after each step.

Manual: with a key in `.janissary/gemini-token` and nothing exported, open a workspaced opencode harness on a `google/…` model and confirm it answers rather than reporting a missing key; confirm the same for a workspaced ACP tab.
