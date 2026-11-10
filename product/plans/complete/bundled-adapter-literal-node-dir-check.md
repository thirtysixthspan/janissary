# Describe both PATH-keeping conditions for a bundled adapter and pin the literal-directory check

**Complexity: 1/10** — ~4 reworded comment lines in 1 file, 2 requirements, 1 test scenario (p=3.25)

## Goal

The symlinked-node fix (`product/plans/complete/bundled-adapter-symlinked-server-node.md`) rewrote the header comment and the doc comment above `locateAcpCommand` in `src/acp/command-path.ts`, and the "Provider and model" paragraph of `product/specs/acp.md`, to say the server's node directory is prepended to a bundled adapter's PATH when that PATH does not already resolve `node` to the server's own node. `withServerNode` also returns the environment unchanged whenever the server's node directory is literally one of PATH's entries, even when a different `node` listed earlier is the one `#!/usr/bin/env node` would run. The wording leaves that condition out, and no test exercises it on its own: the only literal-entry test lists the server's node where the realpath check passes it too. A maintainer could delete the literal check as redundant with every test still green.

## Design decisions

- No behavior change. `withServerNode` keeps both conditions exactly as they are; whether a later-listed server node should be moved ahead of an earlier different node is a separate decision.
- The wording names both conditions: the directory is added when PATH neither lists the server's node directory nor resolves `node` to the server's own node.
- The new test puts a different `node` ahead of the server's node directory, which is the one case only the literal check keeps unchanged, and asserts the environment is the same object.

## Implementation steps

1. `src/acp/command-path.ts`: reword the header comment's last sentence so the server's node is put ahead of a PATH that neither lists its directory nor resolves `node` to it. Reword the doc comment above `locateAcpCommand` so the server's node directory is added to the front of PATH when PATH neither lists the server's node directory nor resolves `node` to the server's own node. Leave the code untouched.
2. `product/specs/acp.md`: in the "Provider and model" paragraph, say the directory of the Node that runs Janissary is added to the front of an adapter's PATH when that PATH neither lists that directory nor resolves `node` to the Node that runs Janissary.
3. `src/acp/command-path.test.ts`: add the case below beside `puts the server's node first for a bundled command whose PATH finds a different node first`.
4. Confirm the new case fails when the `searchPath.split(':').includes(nodeDir)` condition is temporarily removed, then revert.

## Tests

`src/acp/command-path.test.ts`:

- `keeps the environment of a bundled command whose PATH lists the server's node after a different node`: builds `otherNodeDir` with `binDirWith('node')`, passes `{ PATH: `${otherNodeDir}:${serverNodeDir}` }` for `claude-agent-acp`, and asserts `located.env` is the same object. It fails when the literal-directory check is removed.
- `keeps the environment of a bundled command whose PATH already lists the server's node`, `keeps the environment of a bundled command whose PATH reaches the server's node through a symlink`, and the different-node case keep passing unchanged.

## Spec and docs updates

- `product/specs/acp.md`: the "Provider and model" paragraph names both conditions that leave an adapter's PATH unchanged.
- No help or user documentation describes this PATH handling.

## Out of scope

- Any change to `withServerNode`'s behavior, including moving a later-listed server node ahead of an earlier different node.
- Other `locateAcpCommand` branches.
