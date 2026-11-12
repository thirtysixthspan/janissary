# Correct the ask, tell, and roles help pages for the default file-read grant

**Complexity: 1/10** — docs-only; three help-page corrections, 0 production lines or files, no behavior change (p≈2.55).

## Issue

The three help pages still describe the default role grants from before `file read` joined the native commands. `help/ask.md` omits it from the default ask summary, `help/tell.md` says the tell role has "all nine native commands" and lists nine, and `help/roles.md` omits it from the default-role summary. `DEFAULT_ROLES` in `src/plugins/roles/roles-file.ts` grants `file read` to ask and grants tell all ten commands in `NATIVE_ACP_COMMANDS` in `src/plugins/roles/shared.ts`. Severity: 4/10.

## Goal

Make the three help pages agree with the role defaults: ask can read a file from the workspace, tell has all ten native commands including `file read`, and the roles summary names the file-read grant.

## Approach

- In `help/ask.md`, add reading a file from the workspace to the default ask summary, after the existing database, browsing, and question grants.
- In `help/tell.md`, change "all nine native commands" to "all ten native commands" and add `file read` to the command list.
- In `help/roles.md`, add reading files from the workspace to the default ask summary, keeping the existing note that tell also starts with database create/delete and browser eval.
- Leave `help/file.md`, the `file` row in `help/commands.md`, and the generated `documentation/user-documentation/command-reference/` page untouched. The command reference is generated from the help pages by the docs build.
- Use `DEFAULT_ROLES` and `NATIVE_ACP_COMMANDS` as the source of truth rather than restating a count from memory.

## Implementation steps

1. Update the default ask summary in `help/ask.md`.
2. Update the default tell grant sentence in `help/tell.md`, including the count and the command list.
3. Update the default-role summary in `help/roles.md`.
4. Run `grep -rn "nine native commands" help/` and confirm no matches, then read all three pages against the two constants.
5. Run `$janissary/scripts/run.mjs check-diff` and `npm run docs:build`.

## Tests

None new. The change is prose only, and the behavior it describes is already covered by the roles tests. The existing help-page test in `src/commands.test.ts` continues to check that every command row has a page and no page is orphaned. The verification net for this correction is the search check plus a comparison of the three pages with `DEFAULT_ROLES` and `NATIVE_ACP_COMMANDS`.

## Spec and documentation

No functional spec change is needed. `product/specs/roles.md` already states that ask grants `file read` as one of seven commands and that tell grants all ten native commands, and `product/specs/acp.md` records the same default grants. The user documentation pages, including `documentation/user-documentation/tab-types/roles.md` and `documentation/user-documentation/advanced-agents/acp-agent.md`, already describe reading a file from the workspace. This fix only brings the three help pages in line with those documents and the code.

## Out of scope

- Changing any role default, command behavior, or code.
- Editing `help/file.md`, the `file` row in `help/commands.md`, or the generated command reference page.
- Adding or changing user documentation pages.

## Verification

- `grep -rn "nine native commands" help/` returns no matches.
- `help/ask.md`, `help/tell.md`, and `help/roles.md` list the same default grants as `DEFAULT_ROLES` and `NATIVE_ACP_COMMANDS`.
- `$janissary/scripts/run.mjs check-diff` passes; a docs-only diff may select no lint, typecheck, or test step.
- `npm run docs:build` succeeds so the generated command reference reflects the edited pages.
