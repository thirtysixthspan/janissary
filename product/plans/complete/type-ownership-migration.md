# Direct type ownership imports

**Complexity: 9/10** — the compatibility barrel was consumed across server and test code, so
the migration crossed many domain boundaries and had to preserve each type's defining module.

## Goal

Remove the root `src/types.ts` compatibility hub and make imports point directly at the module that
owns each type.

## Implementation

- Replaced root-barrel imports with direct imports from the tab, profile, ACP, agent, schedule,
  connection, browser, completion, database, controller, transcript, config, messaging, resolve,
  and user-agent modules.
- Removed `src/types.ts`; domain-local `types.ts` modules remain the ownership boundaries for
  their own code.
- Kept runtime behavior unchanged; this is an import-ownership refactor.

## Verification

`npm run typecheck:diff`, `npm run lint:diff`, and `./scripts/run.mjs check-diff` pass.
