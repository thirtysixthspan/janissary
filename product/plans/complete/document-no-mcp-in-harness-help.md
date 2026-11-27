# docs: document the --no-mcp harness opt-out in in-app help

**Complexity: 1/10** — documentation-only: no production code, files, requirements, scenarios or units counted (p=1.58)

## Goal

Make the in-app help describe the `--no-mcp` launch flag the parser already accepts, so a user who needs MCP injection off can discover the opt-out without leaving the app. The parser, the behavior spec and the tests already carry the flag; only the two help surfaces are behind.

Source: the single entry in `./product/backlog/pull-request.md` on PR #2256's head branch `feat/janissary-mcp-server`.

## Requirements

1. "`In help/harness.md add [--no-mcp] to the usage grammar line`" — the launch usage line must show `[--no-mcp]`.
2. "`stating that MCP injection is on by default`" — the harness help must state the default-on behavior.
3. "`--no-mcp opts out`" — the harness help must state what the flag does.
4. "`and the negative form wins if both appear`" — the harness help must state the conflict rule.
5. "`In help/commands.md add --no-mcp to the harness row's list of opt-out flags`" — the command index's harness row must list `--no-mcp` among its opt-outs.
6. "`The **Commands** table in `help/commands.md` is kept in alphabetical order by command name`" (`ai/guidelines/documentation.md`) — the row edit must not reorder the table.

## Design decisions

- Only `help/harness.md` and `help/commands.md` change: the entry's Proposal and the invocation's scope guard keep the parser, command builder, tests, specs and every other help page untouched.
- `[--no-mcp]` is inserted as its own optional token at the same position as the authoritative grammar in `product/specs/harness.md:13`, with no invented positive spelling.
- The flag paragraph sits with the other flag descriptions at the foot of `help/harness.md`, outside the use-case and example lists.
- The commands-row edit extends only the description; the row stays where it is because the table is alphabetical by command name.
- Verification is reading-based, since the change adds no code and alters no application behavior.

## Preserved behavior

1. The parser keeps accepting `--no-mcp` and keeps the negative-wins rule: the help edits must not touch `src/harness/command-parse.ts` or the command builder, so `harness opencode --mcp --no-mcp` must still parse with `mcp: false` and no launch-command assertion may need to change; pinned by `parseHarnessCommand — --no-mcp` › `lets --no-mcp override a positive form` in `src/harness/command-parse.test.ts`.

## Assumptions

1. `src/harness/command-parse.test.ts:194` `describe('parseHarnessCommand — --no-mcp'` — the accepted forms, default and conflict rule are already pinned by tests, so the help change needs no new test.
2. `product/specs/harness.md:13` `[--no-mcp]` — the behavior spec's command grammar is authoritative for the documented surface and already includes the flag.
3. `help/harness.md:9` `harness <claude|opencode|codex> [as <label>]` — the usage line is the in-app grammar exposed by `help harness` and currently omits `--no-mcp`.
4. `help/commands.md:54` `` Use `--no-workspace`, `--no-browser`, `--no-auto-approve`, or `--no-auto-resume` to opt out `` — the harness row is the command index's list of opt-out flags and omits `--no-mcp`.

## Existing functionality

1. The behavior spec's command grammar listing `[--no-mcp]` — `product/specs/harness.md:13`.
2. The parser's `--no-mcp` cases — `src/harness/command-parse.test.ts:194` `describe('parseHarnessCommand — --no-mcp'`.
3. The flag-description paragraphs at the foot of the harness help page — `help/harness.md:29` `` The `--model` value must be enabled `` and `help/harness.md:35` `` --auto-resume is supported only by ``.
4. The alphabetical Commands table — `help/commands.md:3` `| Command | Description |` and `ai/guidelines/documentation.md:87` `kept in alphabetical order by command name`.

## Implementation steps

1. In `help/harness.md`, insert `[--no-mcp]` into the usage grammar on line 9, immediately before `[--auto-resume|--no-auto-resume]`, matching `product/specs/harness.md:13`. Build and check with `$janissary/scripts/run.mjs check-diff`.
2. In `help/harness.md`, add one short paragraph beside the other flag descriptions at the foot of the page, stating that MCP injection is on by default, `--no-mcp` opts out, and the negative form wins if both appear. Build and check with `$janissary/scripts/run.mjs check-diff`.
3. In `help/commands.md`, add `--no-mcp` to the harness row's list of opt-out flags without moving the row, keeping the table alphabetical. Build and check with `$janissary/scripts/run.mjs check-diff`.

## UI design

1. The in-app `help harness` page gains `[--no-mcp]` in its usage grammar and one short flag-description paragraph; the New harness dialog and the terminal UI are unchanged.
2. The `help commands` table's harness description gains the flag; row order is unchanged.

## Tests

- No new tests: the plan adds no application code and changes no behavior. The existing `--no-mcp` cases in `src/harness/command-parse.test.ts` pin the flag and must keep passing under `$janissary/scripts/run.mjs check-diff`; tests of documentation are not introduced.

## Out of scope

- The parser, command builder, New harness dialog and every source file.
- `product/specs/` and every help page other than `help/harness.md` and `help/commands.md`.
- `documentation/user-documentation/` and `documentation/developer-documentation/`.
- A PR description correction: the work item calls for none.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then perform these concrete reading-based checks:

1. In `help/harness.md`, confirm the usage grammar contains `[--no-mcp]` in the spec's position and that a paragraph beside the other flag descriptions states the default-on behavior, the opt-out and the negative-wins rule. A failure is a usage line that still jumps from `[--browser|--no-browser]` to `[--auto-resume`, or no such paragraph.
2. In `help/commands.md`, confirm the `harness` row lists `--no-mcp` with the other opt-out flags and the rows remain alphabetical. A failure is a missing flag or a reordered table.
3. Read `product/specs/harness.md:13` and the `--no-mcp` cases in `src/harness/command-parse.test.ts:194-218` against the two help pages: every accepted harness opt-out named there appears in the in-app help, and no launch-command assertion needs to change. A failure is an accepted opt-out the help still omits.
