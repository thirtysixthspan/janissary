# Refresh the all-tokens harness spawn test

**Complexity: 1/10** — no production lines or files, two requirements, one test scenario (p=2.61)

`src/sandbox/harness-spawn.test.ts` still calls its aggregate credential case "injects every credential when all five tokens are given" and builds a fixture of the five rows that existed before the Tavily and TinyFish rows landed. `PROJECT_TOKENS` in `src/project/tokens.ts` now has seven rows, so the name overstates what the case covers and the confined harness-spawn path is never exercised for `TAVILY_API_KEY` or `TINYFISH_API_KEY`. A regression that stopped either new key reaching a confined spawn would pass this suite while the case name told a reviewer the path was covered.

## Goal

The aggregate case in `src/sandbox/harness-spawn.test.ts` configures all seven `PROJECT_TOKENS` rows, asserts both `TAVILY_API_KEY` and `TINYFISH_API_KEY` alongside the five credentials it already asserts, and carries a name that makes no claim about a count. The per-credential, ambient-value, and precedence cases above it stay byte-for-byte unchanged, as do the table-driven cases in `src/project/tokens.test.ts` and `src/sandbox/environment.test.ts`.

## Approach

Extend the `tokens` fixture inside the aggregate case with `tavily: 'tvly_live_key'` and `tinyfish: 'tinyfish_live_key'`, placing them after `gemini` to match the table order in `PROJECT_TOKENS`. Add one assertion per new variable, after the Gemini pair:

```ts
expect(result.env.TAVILY_API_KEY).toBe('tvly_live_key');
expect(result.env.TINYFISH_API_KEY).toBe('tinyfish_live_key');
```

Rename the case from "injects every credential when all five tokens are given" to "injects every configured credential", so the name describes the aggregate coverage without a count that drifts as rows land. The `GH_CONFIG_DIR` assertion stays where it is, between `GH_TOKEN` and the Claude token, because it is the GitHub row's companion variable rather than a sixth credential.

## Implementation steps

1. In `src/sandbox/harness-spawn.test.ts`, rename the case and extend its `tokens` fixture and assertions as described above.
2. Re-read the case against the seven `PROJECT_TOKENS` rows in `src/project/tokens.ts` — `github`/`GH_TOKEN`, `claude`/`CLAUDE_CODE_OAUTH_TOKEN`, `opencode`/`OPENCODE_API_KEY`, `kilo`/`KILO_API_KEY`, `gemini`/`GEMINI_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY`, `tavily`/`TAVILY_API_KEY`, `tinyfish`/`TINYFISH_API_KEY` — and confirm every row's variable appears in both the fixture and the assertions, so an eighth row would be visibly missing rather than silently absent.
3. Run `$janissary/scripts/run.mjs check-diff`.

## Tests

The extended case is itself the regression test: it runs `confinedHarnessSpawn` with all seven credentials and asserts every variable its table row names, including the two search keys on the confined path for the first time. No new test case is added. The table-driven mappings in `src/project/tokens.test.ts` and `src/sandbox/environment.test.ts` remain the durable guard for the table itself and stay untouched.

Verification is the seven-row reading in step 2 and `$janissary/scripts/run.mjs check-diff`, which runs the sandbox test file plus lint and typecheck.

## Spec

No spec change is needed. The runtime behavior is unchanged, and `product/specs/sandbox.md` already names both search variables, their token files, their reach, and their scrub behavior from the earlier token-row change.

## Out of scope

- `src/project/tokens.ts`, `src/sandbox/environment.ts`, `src/sandbox/harness-spawn.ts`, and every other production file; the injection is already implemented and must not change.
- The per-credential, ambient-value, and precedence cases in `src/sandbox/harness-spawn.test.ts`, which already cover the fallback and precedence rules.
- The table-driven cases in `src/project/tokens.test.ts` and `src/sandbox/environment.test.ts`, which must keep passing untouched.
- `product/specs/` and `documentation/user-documentation/`, since no documented behavior changes.
