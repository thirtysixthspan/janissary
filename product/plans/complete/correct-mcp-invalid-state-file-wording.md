# docs(mcp): correct the MCP server spec's invalid-state-file wording so a token-only file is valid

**Complexity: 1/10** — no production lines or files, 7 requirements, no test scenarios (p=3.04)

## Goal

The Server section of `product/specs/mcp-server.md` says a state file that "isn't valid JSON, or holds no valid token and port" fails with the `invalid MCP state file <path>; ...` reason. That reads as if a file without a port is broken. But the server writes exactly that token-only file on a first start under an `mcpPort` override, and it reads such a file back as valid saved state, as the paragraph just above says. A later change that followed the failure sentence could tighten the decoder and turn every project first started under an override into a permanent MCP start failure. This plan rewords that one clause to name the three cases the decoder really refuses and to say a token-only file is valid.

## Requirements

1. The broken-state-file paragraph no longer says a file is invalid when it "holds no valid token and port", per the issue "a state file that 'holds no valid token and port' fails ... yet the server writes a token-only file".
2. The paragraph says a file that isn't a JSON object gets the invalid reason, per the proposal "refuses a file only when it is not a JSON object".
3. The paragraph says a file with no non-empty string token gets the invalid reason, per the proposal "has no non-empty string `token`".
4. The paragraph says a file whose port is present but isn't a whole number from 1 to 65535 gets the invalid reason, per the proposal "has a `port` key that is not a whole number from 1 to 65535".
5. The paragraph says a token-only file is valid saved state, per the proposal "state those three cases and that a token-only file is valid saved state".
6. Both reason texts stay verbatim, per the proposal "leaving both reason texts and the rest of the paragraph unchanged".
7. The rest of the paragraph stays unchanged, per the same proposal sentence.

## Design decisions

- Only the one clause in the broken-state-file paragraph of `product/specs/mcp-server.md` changes. The work item names that clause, and the playbook forbids editing files the fix does not touch.
- The three refused cases are worded from `decodeState` (Assumption 1), not from the old spec sentence, because the decoder is what the tests pin.
- "Isn't a JSON object" replaces "isn't valid JSON" because the decoder also refuses valid JSON that isn't an object, such as `5` or `null` (Assumption 1). Unparseable text is still covered, since it isn't a JSON object either.
- The token-only sentence says what such a file leads to by pointing back at the paragraph above rather than restating the port rules, since that paragraph already says the first later start without an override picks a reachable port and saves it (Assumption 3).
- No code or test changes, because the proposal says so and the existing tests already pin both sides of the rule (Preserved behavior 1 and 2).

## Preserved behavior

1. A token-only state file is valid saved state. The spec correction must not change the decoder, so a token-only file under `mcpPort` must not be refused or rewritten. Pinned by `binds mcpPort over a token-only state file without changing it` in `src/mcp/manager.test.ts`.
2. A file that isn't valid JSON gets the invalid reason with the remedy. The spec correction must not change the reason text, so the start must not succeed or report a different message. Pinned by `names the state file and the remedy when it is not valid JSON` in `src/mcp/manager.test.ts`.
3. A file that can't be read gets the unreadable reason with the filesystem error. The correction must not change that text. Pinned by `names the state file and the remedy when it cannot be read` in `src/mcp/manager.test.ts`.

## Assumptions

1. The decoder refuses a non-object, a missing or empty token, and an out-of-range present port, and accepts a missing port: `src/mcp/manager.ts:37` "`function decodeState(value: string): State | undefined`", with `src/mcp/manager.ts:40` "`if (typeof parsed !== 'object' || parsed === null) return undefined;`", `src/mcp/manager.ts:42` "`if (typeof token !== 'string' || token === '') return undefined;`", and `src/mcp/manager.ts:43` "`if (port === undefined) return { token };`".
2. A valid port is a whole number from 1 to 65535: `src/mcp/manager.ts:34` "`Number.isSafeInteger(value) && value >= 1 && value <= 65_535`".
3. The spec's paragraph above already describes the token-only file and its later reachable draw: `product/specs/mcp-server.md:9` "A first start under an override saves only the token, so the first later start without the override picks a reachable port as above and saves it beside that token."
4. A refused file produces the invalid reason: `src/mcp/manager.ts:60` "`` `invalid MCP state file ${file}; ${STATE_REMEDY}` ``".

## Existing functionality

1. The spec paragraph being corrected: `product/specs/mcp-server.md:11` "A file that isn't valid JSON, or holds no valid token and port, gives the reason `invalid MCP state file <path>; delete it and restart Janissary to replace it`."

## Implementation steps

1. In the broken-state-file paragraph of `product/specs/mcp-server.md`, replace the clause "A file that isn't valid JSON, or holds no valid token and port," with one naming the three refused cases: a file that isn't a JSON object, has no non-empty string token, or has a port that isn't a whole number from 1 to 65535. Keep the reason text verbatim. Add one short sentence after it saying a file with a token and no port is valid saved state, the one a first start under an override writes. Leave every other sentence in the paragraph as it is. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Promote this plan to `product/plans/complete/` and remove the resolved entry from `product/backlog/pull-request.md`, leaving the other entries unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. The change is to a spec file only, and no user-visible surface changes.

## Tests

This plan changes no application behavior and introduces no code, so it adds no tests. The tests named under Preserved behavior already pin the token-only and invalid-file cases the corrected sentence describes.

## Out of scope

- Any change to `decodeState`, `loadState`, or the reason texts in `src/mcp/manager.ts`.
- Any other paragraph of `product/specs/mcp-server.md`, including the port-selection paragraph above.
- The other entries in `product/backlog/pull-request.md`.
- `documentation/user-documentation/` and `documentation/developer-documentation/`.
- The PR description and title.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then read the broken-state-file paragraph of `product/specs/mcp-server.md` against `decodeState` in `src/mcp/manager.ts`. The paragraph should name exactly three refused cases: not a JSON object, no non-empty string token, and a port that isn't a whole number from 1 to 65535. It should say a token-only file is valid saved state. Both reason texts, `invalid MCP state file <path>; delete it and restart Janissary to replace it` and `unreadable MCP state file <path> (<error>); delete it and restart Janissary to replace it`, should be unchanged. The phrase "holds no valid token and port" surviving, a missing port listed as a refused case, or a changed reason text means the correction was wrong.
