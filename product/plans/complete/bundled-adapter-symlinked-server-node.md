# Leave a bundled adapter's PATH unchanged when its node already resolves to the server's own node

**Complexity: 2/10** — ~12 added production lines in 1 file, 3 requirements, 3 test scenarios (p=3.94)

## Goal

The node-on-PATH fix (`product/plans/complete/bundled-acp-adapter-node-on-path.md`) promised that a server whose `PATH` already holds its node sees no change. `withServerNode` in `src/acp/command-path.ts` keeps that promise only when `path.dirname(process.execPath)` is literally one of the `:`-separated `PATH` entries. `process.execPath` is the symlink-resolved path, so a Homebrew node reached through `/opt/homebrew/bin/node` reports `/opt/homebrew/Cellar/node/<version>/bin/node`, the literal check misses, and every claude and codex role agent gets the Cellar directory prepended to its `PATH`, ahead of the user's own `npm` and `npx`.

## Design decisions

- Keep the literal directory check as the first, cheap test.
- Add a second test: find the first executable `node` on the given `PATH` with the existing `findOnPath('node', searchPath)`. When one exists and its `realpathSync` equals `realpathSync(process.execPath)`, return the env unchanged, as the same object, because `#!/usr/bin/env node` already runs the server's node there.
- Only the first `node` on `PATH` counts, because that is the one `/usr/bin/env node` runs. A server node listed later behind a different `node` is still caught by the literal check, as before.
- Any error from either `realpathSync` falls through to the prepend, so a broken symlink or a vanished file behaves like a `PATH` without the server's node.
- A node reached only through a version-manager shim (volta, asdf, mise) resolves to a different file than `process.execPath`, so those setups keep getting the prepend. That is the original plan's deliberate behavior for a `PATH` whose node is not the server's.
- Only the `.bin` branch of `locateAcpCommand` calls `withServerNode`, so the path-given, PATH-hit, and shell-fallback branches are unaffected.

## Implementation steps

1. `src/acp/command-path.ts`: import `realpathSync` from `node:fs`. Add a module-private function that returns whether the first `node` `findOnPath` finds on the given search path resolves, through `realpathSync`, to the same file as `process.execPath`, returning false when no `node` is found or either resolution throws. Move `findOnPath` above `withServerNode` so the new helper can use it, and have `withServerNode` return `env` unchanged when either the literal directory check or the new check holds. Update the header comment's last sentence and the doc comment above `locateAcpCommand` to say the server's node directory is added "when PATH does not already resolve `node` to the server's own node". The file stays well under the 200-line limit.

## Tests

`src/acp/command-path.test.ts`:

- A bundled hit whose `PATH` begins with a temp directory holding a `node` symlink to `process.execPath`, followed by `/nonexistent-a`, returns the same env object.
- A bundled hit whose `PATH` begins with a temp directory holding an executable `node` that is not the server's node still gets the server's node directory prepended.
- The existing bundled cases (`resolves a command the install bundles…`, `prefers the bundled copy…`, `keeps the environment of a bundled command…`, `gives a bundled command with no PATH…`, `starts a bundled node script…`) keep passing unchanged.

## Spec and docs updates

- `product/specs/acp.md` "Provider and model": change "when that PATH does not already list it" to say the directory is added when that PATH does not already resolve `node` to the Node that runs Janissary.
- `documentation/user-documentation/advanced-agents/acp-agent.md` does not describe the PATH adjustment, so no change.

## Out of scope

- Version-manager shims that resolve to a different file than the server's node; they keep the prepend.
- Moving the server's node ahead of a different `node` listed earlier on a `PATH` that also lists the server's node directory literally.
- Any change to the interactive-shell fallback or the other `locateAcpCommand` branches.
- Windows `PATH` delimiter handling.
