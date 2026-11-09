# Return the Commands payload schema version to 1

**Complexity: 1/10** — one constant and the test literal that pins it.

The native application commands plan starts the Commands plugin payload schema at 1 because the plugin has never shipped. A later commit raised `COMMANDS_PAYLOAD_SCHEMA_VERSION` to 2 when it added the optional `overridden` field, though nothing has been released at version 1.

## Goal

Restore the Commands payload schema version to 1 so the code matches the plan and later schema changes are numbered from the right baseline.

## Approach

1. Set `COMMANDS_PAYLOAD_SCHEMA_VERSION` to 1 in `src/plugins/commands/shared.ts`. The manifest, the client registry and their tests read the constant, so they follow.
2. Update the one literal in `src/plugins/commands/manifest.test.ts` that pins the version.

## Tests

- `manifest.test.ts`: the manifest's payload schema version equals the constant and is 1.

## Out of scope

- Any change to the `overridden` field itself, its guards, or its rendering.
