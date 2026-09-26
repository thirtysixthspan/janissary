# Validate every field a profile agent entry can carry

Backlog: technical debt — "Validate every field a profile's agent entry can carry, not only its name and remote, so a hand-written profile that would break a launch is refused by validation."

Complexity rating: 3/10

## Goal

`agentProblems` in `src/profile/schema.ts` checked only `name` and `remote`, while the loader spreads every key through and `openAgentEntry` reads `cwd` (through `expandUserPath`), `cmdHistory`, the log, `workspaceDir`, `context` and `schedule`. A profile with `"cwd": 5` passed `profile validate` and then threw after the tab was inserted — the half-finished launch `product/specs/profiles.md` promises cannot happen — and a harness-style string `schedule` on an agent was handed to the schedule manager as entry objects.

## Approach

Extend `agentProblems` with `checkField` calls for string `cwd`, `workspaceDir` and `title`, boolean `active` and `offline`, string arrays `cmdHistory`, `context` and `commandQueue`, and object arrays `log` and `schedule`. `checkField` gains an `'object[]'` kind. To keep `schema.ts` under the file-size limit, `checkField`, its kind type and `isObject` move to a new `src/profile/schema-fields.ts`.

## Tests

- `src/profile/file.test.ts`: one rejection per field, including the harness-style string `schedule`, each asserting the located message; an agent entry carrying every field well typed still loads.
- `src/profile/schema.test.ts`, `src/profile/validate.test.ts`, `src/profile/agent-opener.test.ts` and `src/profile/save.test.ts` (the `writeAgentEntry` round trip) keep passing, so every profile `profile save` writes still validates. The shipped profiles under `profiles/` use only well-typed fields.

## Out of scope

- Deriving the agent entry type from its own schema instead of `AgentState`, so a newly added state field is checked without someone adding it here.
- Validating the shape inside each `log` or `schedule` element.

## Specs and docs

- `product/specs/profiles.md`: the malformed-profile rule names the agent fields that are checked.
- `help.md` and `documentation/user-documentation/automation/profiles.md` describe validation generally; no edit.
