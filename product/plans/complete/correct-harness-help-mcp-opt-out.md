# docs(harness): correct the harness help's MCP opt-out sentence

**Complexity: 1/10** — no production lines or files, 6 requirements, no test scenarios (p=2.95)

## Goal

The last line of `help/harness.md` says "`--no-mcp` opts out, and the negative form wins if both forms appear". The `harness` command has no positive MCP flag. Its parser only looks for `--no-mcp`, so an `--mcp` token is ignored like any other unknown word, and a reader goes looking for a flag the usage line never shows. The same line also never says that `--offline`, or launching while the local MCP server is not running, turns MCP off. So the in-app help can't explain why an offline harness has no `janissary` server. This plan rewrites that one sentence to state only the flag that exists and the off rule the spec already gives.

## Requirements

1. The help's closing MCP paragraph no longer says "the negative form wins if both forms appear", per the work item "though no positive `--mcp` flag exists".
2. The paragraph still says MCP injection is on by default, per the proposal "say that MCP is on by default".
3. The paragraph still says `--no-mcp` opts out, per the proposal "that `--no-mcp` opts out".
4. The paragraph says an `--offline` launch gets no MCP config, per the work item "never says `--offline` ... also turns MCP off".
5. The paragraph says a launch made while the local MCP server is not running gets no MCP config, per the work item "(or launching while the MCP server is down)".
6. The usage line of `help/harness.md` is unchanged, per the proposal "Leave the usage line alone".

## Design decisions

- Only the last paragraph of `help/harness.md` changes. The work item names that line, and the playbook forbids editing files the fix does not touch.
- No positive form is mentioned, because the parser recognizes only `--no-mcp` (Assumption 1) and ignores unrecognized tokens (Assumption 2).
- The off conditions are worded to match the MCP server config section of `product/specs/harness.md` (Assumption 3), so help and spec agree. The spec already states this rule, so it does not change.
- The offline rule is stated as a launch outcome, not a parser rule, because `--offline` turns MCP off at spawn rather than in the parser (Assumption 4).
- The JSDoc on `parseHarnessCommand` carries the same "any positive form" wording. It is left alone because the proposal says "make no code change" and the work item names only the help page.

## Preserved behavior

1. `--no-mcp` turns MCP off in any case. The help correction must not change the parser, so `harness claude --no-mcp` must still parse with MCP off. Pinned by `turns mcp off with --no-mcp, in any case` in `src/harness/command-parse.test.ts`.
2. An `--offline` launch carries no MCP variables or fragment. No code changes, so an offline launch must not start receiving MCP config. Pinned by `passes no MCP variables or fragment with --offline` in `src/harness/tab-spawn.test.ts`.
3. Every command row in `help/commands.md` keeps a matching help page. Editing `help/harness.md` must not rename or remove the page. Pinned by `has a help page for each command row and no orphan command pages` in `src/commands.test.ts`.

## Assumptions

1. The parser checks only for the negative MCP token: `src/harness/command-parse.ts:122` "`const mcp = tokens.every((t) => t.toLowerCase() !== '--no-mcp');`".
2. Flags are read by name and unmatched tokens raise no error: `src/harness/command-parse.ts:212` "`const flags = parseHarnessFlags(groupClause.tokens.slice(1), name, remote);`", with `parseHarnessFlags` only testing named tokens such as `'--offline'` at `src/harness/command-parse.ts:120`.
3. The spec states the off rule: `product/specs/harness.md:441` "MCP is off when the launch carries `--no-mcp` or `--offline`, or when the local server is not running."
4. The effective rule is applied at spawn: `src/harness/tab-spawn.ts:53` "`options.mcp !== false && !offline && launch !== undefined`".

## Existing functionality

1. The help page the `help harness` command prints: `help/harness.md:37` "MCP injection is on by default, giving the harness the Janissary MCP server connection."
2. The spec section whose wording the help follows: `product/specs/harness.md:435` "### MCP server config".

## Implementation steps

1. Rewrite the last paragraph of `help/harness.md`. Keep its first sentence. Replace the `--no-mcp` sentence with one saying `--no-mcp` opts out, then add one saying a launch with `--offline`, or one made while the local MCP server is not running, also gets no MCP config. Leave the usage line and every other paragraph as they are. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Promote this plan to `product/plans/complete/` and restore `product/backlog/pull-request.md` to the empty master skeleton, since this is its last entry. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. The `help harness` output, and the docs site's generated Command Reference page built from the same source, show the corrected closing paragraph. Nothing else in either surface changes.

## Tests

This plan changes no application behavior and introduces no code, so it adds no tests. The tests named under Preserved behavior already pin the parsing and spawn behavior the corrected sentence describes, and `src/commands.test.ts` keeps checking that the page exists.

## Out of scope

- Any code change, including the matching JSDoc wording in `src/harness/command-parse.ts`.
- Adding a positive `--mcp` flag.
- `product/specs/harness.md`, which already states the rule.
- `documentation/user-documentation/` and `documentation/developer-documentation/`.
- The PR description and title.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then read `help/harness.md`. Its usage line should still end its flag list with `[--no-mcp] [--auto-resume|--no-auto-resume] [--model <name>] [--effort <level>] [with <prompt>]`. Its last paragraph should say MCP injection is on by default, that `--no-mcp` opts out, and that an `--offline` launch or one made while the local MCP server is not running gets no MCP config. Compare it with `product/specs/harness.md:441`: the same three off conditions should appear in both. The phrase "negative form wins" surviving, any mention of an `--mcp` flag, or a changed usage line means the correction was wrong.
