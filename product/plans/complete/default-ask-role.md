# Add a default `ask` role

Issue: add a default 'ask' role with description 'When you ask a question via ACP.' with three entries — `opencode` / `opencode-go/deepseek-v4.1-flash` / `medium`, `claude` / `claude-haiku-4-5` / `high`, `codex` / `gpt-6-luna` / `high`.

Complexity rating: 1/10

## Goal

When neither roles file exists, the roles tab creates `~/.janissary/roles.json` from a built-in list of default roles. Add a sixth default role, `ask`, describing the models an `ask` prompt (an ACP question) should use, with its three entries in the order the issue gives them. This only adds the role definition; nothing reads it yet.

## Approach

- Append the `ask` role to `DEFAULT_ROLES` in `src/plugins/roles/roles-file.ts`, after `documentation`, so the five existing defaults keep their order and positions (tests address `DEFAULT_ROLES[0]` and `[1]`).
- The issue gives the description both with and without a trailing period. Use `When you ask a question via ACP.` with the period, matching every other default description, which all end in a period.
- Model ids are stored verbatim; the roles file does not validate them against the harness model catalog, so no catalog change is needed.

## Implementation steps

1. `src/plugins/roles/roles-file.ts`: add the `ask` role with its description and three entries to the end of `DEFAULT_ROLES`.
2. `src/plugins/roles/roles-file.test.ts`: add a test asserting the created home file holds the `ask` role with exactly the issue's description and ordered entries, as the last key.
3. Specs and docs (below).

## Tests

- `roles-file.test.ts`: when neither file exists, the created home file's `ask` key holds `When you ask a question via ACP.` and the three entries in order (`opencode`/`opencode-go/deepseek-v4.1-flash`/`medium`, `claude`/`claude-haiku-4-5`/`high`, `codex`/`gpt-6-luna`/`high`), and `ask` is the last role.
- Existing default-role tests continue to pass, since they compare against `DEFAULT_ROLES` itself.

## Out of scope

- Making ACP sessions use the `ask` role and falling back through its models (separate backlog issue).
- Renaming `harness-models.json` or adding these model ids to it (separate backlog issue).
- Adding the role to existing users' or projects' roles files; defaults apply only when no file exists.

## Specs and docs

- `product/specs/roles.md`: the default-roles paragraph lists six roles, including `ask` with its description and entries.
- `documentation/user-documentation/tab-types/roles.md`: the default-roles sentence lists six roles and notes `ask` comes with three model choices.
- `help/roles.md` and `help/commands.md` do not describe the default roles; no change.
