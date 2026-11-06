# Role native commands and tell documentation integration

**Complexity: 4/10** — reconciles several documentation surfaces and requires an isolated multi-step ACP integration pass across role grants, session concurrency, and connection lifecycle.

## Goal

Finish the cross-feature documentation and manual integration pass for role command grants, tell, concurrent sessions, and role-aware connection identities.

## Decisions and dependencies

- Depends on all preceding subplans: `role-native-command-catalog-and-grants.md`, `role-commands-editor-ui.md`, `role-based-acp-tool-filtering.md`, `role-keyed-acp-session-state.md`, `acp-prompt-isolation-and-role-orchestration.md`, `tell-command-and-reset.md`, and `role-aware-acp-connection-identity.md`.
- Treat the completed implementation and its specs as the source for exact command syntax, messages, default grants, connection names, and accessible labels. The roles tab sorts displayed commands in native vocabulary order, even though the default ask role stores `db sqlite list` before `db sqlite query`.
- User docs describe user goals and observed behavior without code paths or implementation details. Keep their existing headings and agent-image placement, and verify their existing sidebar entries still make them findable; do not edit navigation unless a page path or title changes.
- Keep `help/commands.md` alphabetized by command name and update source help pages, not generated Command Reference pages. `src/commands.test.ts` checks command-table ordering and links to the source pages.
- Run the complete manual ACP smoke flow in an isolated scratch home and project directory, with neither a home nor project `roles.json` present at startup. Use the project start-application task and never read or write the user's real roles file. The flow needs at least one installed, signed-in ACP model; record any provider or credential limitation and do not claim the affected steps passed.

## Existing code to reuse

- `src/plugins/roles/roles-file.ts` (`DEFAULT_ROLES`) and `src/plugins/roles/shared.ts` (`NATIVE_ACP_COMMANDS`) hold the default role grants and canonical command order.
- `web/src/plugins/roles/RoleModels.tsx` (`Models`, `Add model`) and `RoleCommands.tsx` (`Commands`, `Add command`) hold the rendered section labels; the role UI tests pin the picker and remove-button accessible names.
- `src/commands/tell.ts`, `src/commands/tell-reset.ts`, `src/acp/tool-table.ts`, `src/connection/catalog.ts`, and `src/connection/close.ts` are the sources for tell/reset messages, permission refusal, and live role-qualified names and close routing.
- The preceding subplans update `product/specs/roles.md`, `acp.md`, `connection.md`, and `connections-tab.md` at the points their behavior changes; reconcile those four specs after the integration pass.
- `help/ask.md`, `help/commands.md`, `help/connections.md`, and `help/roles.md` are existing command reference sources; add `help/tell.md` and keep `tell reset` on that command page.
- `documentation/user-documentation/advanced-agents/acp-agent.md` and `documentation/user-documentation/tab-types/roles.md` are the user-facing pages named by the source plan. Their existing links appear in `documentation/.vitepress/config.mts` under Advanced Agents and Tab Types.
- `ai/guidelines/user-documentation.md`, `documentation.md`, and `human-writing-guidelines.md` govern audience, images, navigation, and prose.

## Proposed changes

- Reconcile `product/specs/roles.md` with the `commands` field, default ask/tell grants, and the two role-card sections; reconcile `acp.md` with each prompt's role, command refusal, separate sessions, reset behavior, and live names; reconcile `connection.md` and `connections-tab.md` with role-qualified live names, retained names, legacy role-less retained records, and role-specific close routing.
- Update `help/ask.md`, `help/commands.md`, `help/connections.md`, and `help/roles.md`; add `help/tell.md` with usage, role grants, reset success and empty-session messages, the no-model, fallback, exhausted-model, overlap, cancellation, and close messages, and examples. Document role-qualified live connection names and the legacy `acp:<model>` ask lookup behavior in `help/connections.md`. The help and table wording must match the final code exactly.
- Update `documentation/user-documentation/advanced-agents/acp-agent.md` with task-first guidance for choosing `ask` versus `tell`, their separate permissions and sessions, reset/close behavior, and live connection names. Explain the default command grants in user terms: ask can read/query and use browser/question tools, while tell can also create/delete databases and run browser evaluation. Update `documentation/user-documentation/tab-types/roles.md` with how to grant commands, the defaults, the **Models**/**Commands** sections, and the changed **Add model** control. Keep prose user-facing and preserve existing image/navigation conventions.
- Run the source plan's end-to-end verification against isolated scratch state. Start the app with a new scratch home and project directory and no home or project `roles.json`, then open `roles`. Confirm every card has **Models** and **Commands**; the ask card has the six default grants (displayed in native vocabulary order: `db sqlite query`, `db sqlite list`, `browser goto`, `browser content`, `question ask`, `question approve`); and the tell card has all nine grants and no **Add command** button. Use the command row's **Remove db sqlite query** control and confirm `<scratch-home>/.janissary/roles.json` no longer grants it.
- In a shell tab, run `ask create a database called demo` and confirm its tool step returns `Command not allowed for role "ask": db sqlite create.`. Then run `tell create a database called demo` and confirm `db sqlite list` lists `demo`.
- For a controlled overlap, run `tell Ask me one question with the question tool, then wait for my answer before taking any other action.`. While its question is pending, run `ask What is two plus two?`; confirm each prompt settles under its own exact prompt line, then answer the pending tell question so tell can settle. Run `connections list` while both sessions are live and confirm it lists `acp:ask:<provider/model>` and `acp:tell:<provider/model>`.
- Run `tell reset` while tell has an active session. Confirm `ACP tell session reset — next tell prompt will start fresh.` and that the ask session remains listed. Start a new tell session with `tell list the available databases with db sqlite list`; once its live name appears in `connections list`, run `connections close acp:tell:<provider/model>` using that name. Confirm `Closed connection acp:tell:<provider/model>.` and that the ask session remains open. Record each completed step and any provider/credential limitation; do not claim an unrun step passed.
- Run `$janissary/scripts/run.mjs check-diff` after the documentation and integration changes. Do not run `npm run check`.

## Tests

- No new unit-test suite is added in this documentation subplan; all behavior-specific tests belong to their implementation subplans and must pass together under `check-diff`.
- Check the help command table ordering and command-page links with `src/commands.test.ts`; check the docs site's existing sidebar entries for both user pages.
- The manual verification must exercise the persistence, role permission, prompt overlap, live connection naming, role-specific close, and reset paths above. Record which steps ran and any environment limitation; do not claim an unrun step passed.

## Verification

- Run `$janissary/scripts/run.mjs check-diff` for the final aggregate working tree.
- Execute every part of the isolated manual flow above, including the controlled ask/tell overlap and both tell reset and tell-specific connection close.
- Confirm every user-visible command, default, accessible control name, connection name, and message in help, specs, and user docs matches the implementation.

## Out of scope

- Source-code, test, or wire-protocol changes. If integration reveals a code defect, update and re-improve a dedicated subplan before repairing it.
- Rewriting unrelated sections of the specs or user documentation.
