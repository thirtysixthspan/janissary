# Role native commands and tell documentation integration

**Complexity: 3/10** — aligns the complete feature's help, user docs, specs, and manual verification after the server and UI behavior land.

## Goal

Finish the cross-feature documentation and manual integration pass for role command grants, tell, concurrent sessions, and role-aware connection identities.

## Decisions and dependencies

- Depends on all preceding subplans: `role-native-command-catalog-and-grants.md`, `role-commands-editor-ui.md`, `role-based-acp-tool-filtering.md`, `role-keyed-acp-session-state.md`, `acp-prompt-isolation-and-role-orchestration.md`, `tell-command-and-reset.md`, and `role-aware-acp-connection-identity.md`.
- Treat the completed implementation as the source for exact command syntax, messages, default grants, and accessible labels.
- User docs describe user goals and observed behavior without code paths or implementation details. Follow the existing documentation image and navigation conventions when editing the two named user pages.
- Keep `help/commands.md` alphabetized by command name and update source help pages, not generated Command Reference pages.
- Run the prescribed complete manual ACP smoke flow in an isolated scratch state so no real `~/.janissary/roles.json` is overwritten.

## Existing code to reuse

- The preceding subplans update `product/specs/roles.md`, `acp.md`, `connection.md`, and `connections-tab.md` at the points their behavior changes.
- `help/ask.md`, `help/commands.md`, `help/connections.md`, and `help/roles.md` are existing command reference sources; add `help/tell.md`.
- `documentation/user-documentation/advanced-agents/acp-agent.md` and `tab-types/roles.md` are the user-facing pages named by the source plan.
- `ai/guidelines/user-documentation.md`, `documentation.md`, and `human-writing-guidelines.md` govern audience, images, and prose.

## Proposed changes

- Reconcile the four functional specs with the final behavior: the roles schema/defaults/editor, ask/tell prompt grants and concurrent lifecycle, and role-prefixed live and retained connection identity.
- Update `help/ask.md`, `help/commands.md`, `help/connections.md`, and `help/roles.md`; add `help/tell.md` with usage, reset, examples, and exact errors.
- Update `documentation/user-documentation/advanced-agents/acp-agent.md` and `documentation/user-documentation/tab-types/roles.md` with task-first instructions for granting commands and choosing ask versus tell.
- Run the source plan's complete end-to-end verification against isolated scratch state. Start the scratch app with a scratch home/state root and no project or home roles file, then open `roles`. Confirm each card has `Models` and `Commands`, default `ask` shows exactly `db sqlite list`, `db sqlite query`, `browser goto`, `browser content`, `question ask`, and `question approve`, and default `tell` shows all nine commands with no **Add command** button. Remove `db sqlite query` from `ask` and confirm `<scratch-home>/.janissary/roles.json` is rewritten with that grant removed. In a shell tab run `ask create a database called demo` and confirm the tool step's result is `Command not allowed for role "ask": db sqlite create.`; then run `tell create a database called demo` and confirm `db sqlite list` shows `demo`. While a tell prompt runs, run an ask prompt and confirm both settle beneath their own prompt lines. Run `connections list` and confirm it shows `acp:ask:<provider/model>` and `acp:tell:<provider/model>`. Run `tell reset`, confirm `ACP tell session reset — next tell prompt will start fresh.`, and confirm the ask session is still listed.
- Run `$janissary/scripts/run.mjs check-diff` after the documentation and integration changes. Do not run `npm run check`.

## Tests

- No new unit-test suite is added in this documentation subplan; all behavior-specific tests belong to their implementation subplans and must pass together under `check-diff`.
- Check the help command table ordering and command-page links with the existing `src/commands.test.ts` coverage.
- Record which manual integration steps were completed and any environment limitation; do not claim an unrun step passed.

## Verification

- Run `$janissary/scripts/run.mjs check-diff` for the final aggregate working tree.
- Execute every part of the isolated manual flow from the source plan, including ask/tell concurrency and connection close/reset checks.
- Confirm every user-visible command and message in help, specs, and user docs matches the implementation.

## Out of scope

- Source-code, test, or wire-protocol changes. If integration reveals a code defect, update and re-improve a dedicated subplan before repairing it.
- Rewriting unrelated sections of the specs or user documentation.
