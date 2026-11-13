# Hosted write tool 14 — grant writes and edits to the built-in `tell` role

**Complexity: 2/10** — ~2 added lines in 1 file, 3 requirements, 5 scenarios (p=3.75).

Source plan: `./product/plans/complete/janissary-hosted-agent-write-tool.md`. Run order: 14 of 15 in the hosted write tool series. Depends on plan 12 (`janissary-hosted-agent-write-tool-12-acp-file-mutation-tools.md`), which adds the names to the native vocabulary and makes them work as ACP tools, and plan 13 (`janissary-hosted-agent-write-tool-13-remote-loop-mutations.md`), so the default grant works on remote tabs too.

`tell` is the role for carrying out a task, so it is the one role that gets write access by default. `ask` stays read-only, and roles someone already saved keep exactly the grants they list.

## Goal

The built-in `tell` role's default commands include `file write` and `file edit`; the built-in `ask` role's do not; no saved role gains either name automatically.

## Design decisions and dependencies

- Source plan decision: grant `file write` and `file edit` to the built-in `tell` role only, by appending them to its `commands` in `DEFAULT_ROLES` in `src/plugins/roles/roles-file.ts`. Keep built-in `ask` grants unchanged.
- Existing saved roles retain their explicit grants; there is no migration and no payload schema bump, because `ROLES_PAYLOAD_SCHEMA_VERSION` describes the payload shape, which does not change.
- `roles-file.ts` is at 188 counted lines; the two names fit on the existing `tell` commands lines without a new module.

## What already exists (reuse, don't rebuild)

| Existing code | Use |
| --- | --- |
| `src/plugins/roles/roles-file.ts` `DEFAULT_ROLES` | Built-in role definitions |
| `src/plugins/roles/roles-file.test.ts` | Default-role expectations |
| `src/acp/ask-role.test.ts` | Ask-role grant expectations |

## Proposed changes

Append `file write` and `file edit` to the `tell` role's default commands. Update `product/specs/roles.md`: `tell` now grants all twelve native commands, `ask` still grants seven, and saved roles are not changed. Update the matching count sentence in `product/specs/acp.md` that says which roles grant `file read` by default, so it also states the tell-only mutation grants.

## Tests

- `src/plugins/roles/roles-file.test.ts`: the default `tell` role lists both new names; the default `ask` role does not; a saved roles file whose `tell` lacks them reads back without them; a saved role listing them keeps them.
- `src/acp/ask-role.test.ts`: the ask grant list is unchanged.
- `src/acp/run-prompt.test.ts` or `src/acp/drive-loop.test.ts`: a prompt under the default `tell` role can run a `file write`, and one under the default `ask` role is refused with the role refusal.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

## Out of scope

- Any change to `ask`, other built-in roles, or saved roles.
- Autonomous agent grants.
