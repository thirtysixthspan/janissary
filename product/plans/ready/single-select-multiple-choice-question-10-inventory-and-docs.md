# Publish question choose in the command inventory, roles, help, and specs

**Complexity: 3/10** — ~15 added lines, 3 files, 4 scenarios (p=4.35)

Source plan: `./product/plans/complete/single-select-multiple-choice-question.md`. Depends on `single-select-multiple-choice-question-8-command-parsing.md` for the command form and on `single-select-multiple-choice-question-9-mcp-tool-and-executor.md` for the tool shape it documents.

## Goal

The feature works end to end, but the app's own inventories, help, and behavior specs still describe only `question ask` and `question approve`. This subplan makes the published surface agree with the code: the command form and native command list, the built-in roles, the command help, the ask-user skill, and the behavior specs. It is the last subplan and leaves the whole feature documented.

## Requirements

1. "Grant `question choose` to built-in roles that currently have `question ask` or `question approve`." (requirement 36)
2. "Include command parsing, the agent primer, role and command inventory, protocol, panel keyboard navigation, and functional spec." — this subplan publishes the role and command inventory and the functional spec updates; the other pieces land in their named subplans. (requirement 5)
3. The `question choose` native command row has `nativeTool` `question`, and the updated role/command counts hold.

## Design decisions

- Insert `'question choose'` immediately after `'question approve'` in `NATIVE_ACP_COMMANDS` and in both the `ask` and `tell` built-in role lists in `src/plugins/roles/default-roles.ts`. Keep the order identical in all three so the assertion that `tell` equals `NATIVE_ACP_COMMANDS` minus `tab` still holds (Assumption 1, Assumption 2).
- Add `'question choose'` to the `question` row's forms in `src/commands/forms.ts`, after `question approve`.
- Update the count pins in `src/plugins/roles/roles-file.test.ts` and `src/application-commands.test.ts` to the new totals: `ask` 19, `NATIVE_ACP_COMMANDS` 27, `tell` 26 (Assumption 3). The primer example count already moved to 3 in `single-select-multiple-choice-question-8-command-parsing.md`; the `invalidKind` text already moved in `single-select-multiple-choice-question-9-mcp-tool-and-executor.md`.
- Add a `question choose` section to `skills/ask-user/SKILL.md` and mention `question choose` in its front-matter `description`, following the existing `question approve` section's shape.
- Update `help/question.md` with the new usage line, use case, and an example, and add a `question choose` row after `question ask` in `help/commands.md` so the table stays alphabetical by command name (Assumption 5).
- Update the specs that describe changed behavior: `product/specs/agent-questions.md` (commands, panel, keyboard, Escape, the `choose` exception to Cancel-on-tab-switch, and the “no caller-supplied default” sentence), `product/specs/mcp-server.md` (the `choose` kind, `defaultOption`, `Invalid choice question.`, and the loosened `options` type check in the local and relay paragraphs), `product/specs/roles.md` (the default `ask` command list), `product/specs/application-commands.md` (the per-form rows sentence), and `product/specs/keyboard-navigation.md` (the question-panel Shift+Tab exception). State exact messages verbatim, in the house style of `product/specs/`.
- Name only specs, help pages, and the skill file. Do not add a page under `documentation/user-documentation/` or `documentation/developer-documentation/`; a user-documentation gap is a separate follow-up candidate for the report, not a plan requirement.

## Preserved behavior

None found. This step changes inventories and documentation only; no runtime behavior pinned by an existing test changes.

## Assumptions

1. `src/plugins/roles/shared.ts:3` lists native agent commands in `NATIVE_ACP_COMMANDS`, with `'question ask'` and `'question approve'` at lines 11–12. Quote: `'question approve',`.
2. `src/plugins/roles/default-roles.ts:47` and `:63` are the only built-in roles granting `'question ask', 'question approve'`. Quote: `'question ask', 'question approve',`.
3. `src/plugins/roles/roles-file.test.ts:102` pins `expect(file['ask'].commands).toHaveLength(18)`, `:108` pins `expect(NATIVE_ACP_COMMANDS).toHaveLength(26)`, and `:125` repeats the `ask` count. All three move up by one. Quote: `expect(file['ask'].commands).toHaveLength(18)`.
4. `src/application-commands.test.ts:26` pins the native-tool mapping for `question approve`; the new form needs the same row. Quote: `rows.find((row) => row.name === 'question approve')?.nativeTool).toBe('question')`.
5. `ai/guidelines/documentation.md:87` requires the Commands table to stay alphabetical by command name and notes that `src/commands.test.ts` fails on an out-of-order row. Quote: `The **Commands** table in \`help/commands.md\` is kept in alphabetical order by command name`.
6. `help/commands.md:103` lists `question ask`, so the new row belongs immediately after it. Quote: `| \`question ask\` |`.
7. `src/commands/forms.ts:27` declares the row `question: { name: 'question', forms: ['question ask', 'question approve'] }`. Quote: `forms: ['question ask', 'question approve']`.
8. `product/specs/agent-questions.md:47` states `There is no timeout or caller-supplied default.`; that sentence must go. Quote: `There is no timeout or caller-supplied default.`.
9. `product/specs/agent-questions.md:29` says tab-switch focus goes to Cancel “regardless of whether the question is a free-text or approval question”; that sentence needs the `choose` exception. Quote: `regardless of whether the question is a free-text or approval question`.
10. `src/agent/command-tools.ts:37` gates every `question` entry on the `ask-user` skill, so `question choose` inherits that gate without a code change. Quote: `entry.name === 'question' && snapshot.skills.every`.

## Existing functionality

1. `src/plugins/roles/shared.ts:3` provides the native command vocabulary that drives role editing and availability.
2. `src/plugins/roles/default-roles.ts:38` provides the `ask` role and `:54` the `tell` role whose command lists need the new entry.
3. `src/commands/forms.ts:27` provides the one `question` form row the new form joins.
4. `skills/ask-user/SKILL.md` provides the existing `question ask` and `question approve` sections the new section mirrors.
5. `help/question.md` provides the usage/use-case/example structure the new form joins.
6. `product/specs/agent-questions.md` provides the functional spec for question behavior.

## Implementation steps

1. In `src/plugins/roles/shared.ts` and `src/plugins/roles/default-roles.ts`, insert `'question choose'` after `'question approve'` in the native list and both role lists; in `src/commands/forms.ts`, add `'question choose'` to the `question` row. Build and prove green with `$janissary/scripts/run.mjs check-diff`.
2. Update `src/plugins/roles/roles-file.test.ts` and `src/application-commands.test.ts` to the new counts and confirm the `nativeTool` assertion for `question choose`. Build and prove green with `$janissary/scripts/run.mjs check-diff`.
3. Update `help/question.md` and `help/commands.md`; run the command-table order check through `$janissary/scripts/run.mjs check-diff`. Build and prove green with `$janissary/scripts/run.mjs check-diff`.
4. Update `skills/ask-user/SKILL.md` with the new section and front-matter mention. Build and prove green with `$janissary/scripts/run.mjs check-diff`.
5. Update the five specs listed in Design decisions, stating exact messages verbatim and keeping cross-references intact. Build and prove green with `$janissary/scripts/run.mjs check-diff`.

Every step is green at its own commit; no code change is deferred to a later subplan.

## UI design

1. No new UI surface. The published help and skill text is what a person or agent reads to discover the command; the panel itself is unchanged here.

## Tests

- `src/plugins/roles/roles-file.test.ts` and `src/application-commands.test.ts`: requirement 36 and the count assertions in requirement 3.
- `src/commands.test.ts`: keep the help-table ordering and shadowing checks green with the new row.
- No tests are added for docs or skill prose, per the test conventions; correctness is checked by the reading-based verification below.

## Out of scope

- Migrating existing user or project roles files; roles saved before this change do not gain `question choose` automatically.
- Adding or editing pages under `documentation/user-documentation/` or `documentation/developer-documentation/`.
- Re-opening the grammar, validation, or panel behavior decided in earlier subplans.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then read `src/plugins/roles/shared.ts`, `src/plugins/roles/default-roles.ts`, and `src/commands/forms.ts` and confirm `question choose` appears immediately after `question approve` in all three. Read `product/specs/agent-questions.md` and confirm the “no caller-supplied default” sentence is gone and the `choose` panel, Escape, and tab-switch exception are described. Read `product/specs/mcp-server.md` and confirm the `choose` kind, `defaultOption`, `Invalid choice question.`, and the loosened local/relay `options` check are stated verbatim. Read `help/question.md`, `help/commands.md`, and `skills/ask-user/SKILL.md` and confirm the new form is present and the command table stays alphabetical. A stale sentence, a missing form, or a count that still reads 18/26 is a failure.
