# Native commands: Roles restrictions

**Complexity: 3/10** — live topic data must be reflected in an existing picker without changing grants.

## Goal

Show effective native command restrictions beside role grants while keeping grants and picker choices intact.

## Decisions and dependencies

- Depends on the settings host topic and Commands tab work (work units 1–8). Roles consumes the same server-owned snapshot, including the initial current read and later publications; it must not compute a separate authority.
- A disabled grant is dimmed even if added while disabled. An application-wide restriction uses tooltip `Disabled application-wide`, which takes precedence when both settings disable it; an agent-only restriction uses `Disabled for agents`. Parent restrictions count toward effective global availability.

## Existing code to reuse

`src/plugins/roles/activate.ts`, `src/plugins/roles/shared.ts`, `web/src/plugins/roles/RoleCommands.tsx`, roles payload guards and schema, and the host command topic.

## Proposed changes

1. Subscribe Roles to the topic, read the current snapshot on activation, update its payload and guard/schema version as needed, and refresh its open tabs on command policy changes.
2. Display effective restrictions and exact tooltip reasons for existing and newly added grants. Keep ordering, unknown-row presentation, grant storage, and all existing picker choices unchanged.
3. Update the roles and plugin specs to describe the distinction between grants and effective availability.

## Tests

Cover initial snapshot, live updates, both restriction reasons and their precedence, inherited parent restriction, adding a disabled grant, unchanged picker choices and stored grants, unknown grants, and inactive/closed plugin delivery rules.

## Verification

Run `$janissary/scripts/run.mjs check-diff` and focused Roles host/client tests. Manually change both controls in Commands and observe the Roles tooltips using scratch configuration.

## Out of scope

Role-specific overrides and new native ACP tools are excluded.
