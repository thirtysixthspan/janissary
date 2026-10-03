# Require a declaration before a plugin can start a process

**Complexity: 4/10** — one declaration field, one gate where the resources are handed over, and documentation. The contract's shape is unchanged.

**Goal.** Stop `spawnTerminal` reaching an unsandboxed process without appearing anywhere a reviewer looks. It is a resource, so `restrictToDeclared` never saw it and every bundled plugin received it whether or not its manifest asked.

**Approach.** Add a `spawnTerminal` declaration flag beside the existing `playable` and `editsOwnFiles` flags, and gate the resource where it is granted. The alternative the review raised — confining unconditionally — is not available: a terminal launched without a workspace has no workspace to be confined to, and running unconfined in a named directory is what every other unconfined shell in the application does.

The gate cannot live in `restrictToDeclared`, which walks the capability object by name; `spawnTerminal` is not on that object, and adding it there would both misdescribe the contract and break the documentation test that requires every capability name to be documented as one. So the resource is wrapped where `openOrFocusTab` and `updateTab` hand it over.

## Implementation

1. Add `spawnTerminal?: boolean` to `TabPluginDeclaration` in `src/plugins/api.ts`, documented as the right to start a process from a payload factory.
2. In `src/plugins/context.ts`, wrap the resources both factory paths receive: return them unchanged when the declaration sets the flag, and otherwise replace `spawnTerminal` with one that throws the same "without declaring it" message a capability refusal uses.
3. Set the flag in `src/plugins/shell/manifest.ts`.
4. Document the field in the declaration table and in the `spawnTerminal` changelog entry of `documentation/developer-documentation/tab-plugins.md`.

## Tests

In `src/plugins/shell-capabilities.test.ts`:

- a declaration setting the flag receives a working `spawnTerminal`;
- one that does not gets a resource that throws rather than one that silently does nothing.

The second fails if the gate is removed.

## Out of scope

- Capability-set and documentation counts, which do not move: this is a declaration field, not a capability.
- Making confinement mandatory. Recorded in the changelog entry as the remaining, deliberate exposure: a plugin terminal launched without a workspace runs unconfined, exactly as any other unconfined shell does.