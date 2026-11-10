# Tie the role launch commands to the bundled adapters' declared bin names

**Complexity: 1/10** — test-only change with no production lines or files, 3 requirements, 6 scenarios across two adapters (p=3.27)

A role entry for the `claude` or `codex` harness launches its ACP adapter by a bare command name: `acpLaunchForEntry` in `src/acp/launch.ts` returns `claude-agent-acp` for claude and `codex-acp` for codex. `locateAcpCommand` in `src/acp/command-path.ts` resolves that name in the install's own `node_modules/.bin` first, and when it misses there it falls through to the server's PATH and then the interactive shell's PATH. Nothing checks those literals against the `bin` fields of the exact-pinned `@agentclientprotocol/claude-agent-acp` and `@agentclientprotocol/codex-acp` packages, so a version bump that renames either bin would pass every test while role launches silently moved off the bundled copy onto whatever unpinned copy PATH holds, or failed to start.

## Goal

A server test fails whenever the command a claude or codex role entry launches is not a bin name declared by the installed copy of its bundled adapter package, whenever the root `package.json` stops pinning that package to an exact version, or whenever the installed version differs from that pin. No production code changes.

## Approach

Add one colocated server test, `src/acp/bundled-adapters.test.ts`, that reads real files rather than mocks. It deliberately does not mock `../janissary-root.js`, so `janissaryRoot()` answers the checkout root under vitest exactly as it answers the install root in production, and the test reads the same `node_modules` tree `locateAcpCommand` searches.

For each harness/package pair — `claude` → `@agentclientprotocol/claude-agent-acp`, `codex` → `@agentclientprotocol/codex-acp` — the test:

1. Reads the installed `package.json` at `path.join(janissaryRoot(), 'node_modules', '@agentclientprotocol', '<name>', 'package.json')` with `readFileSync` and `JSON.parse`. Reading the path directly sidesteps the package's `exports` map, which can block `require.resolve('<pkg>/package.json')`.
2. Reads the root `package.json` at `path.join(janissaryRoot(), 'package.json')`.
3. Asserts that `Object.keys(bin)` of the installed package contains the `command` that `acpLaunchForEntry` returns for an entry of that harness.
4. Asserts that the root `dependencies` entry for the package is an exact release version (digits-dot-digits-dot-digits), with no range operator such as `^` or `~`.
5. Asserts that the installed `version` equals that pinned version.

The pairs are a small table iterated with `describe.each`/`it.each`, matching the style of `src/acp/launch.test.ts`.

## Implementation steps

1. Create `src/acp/bundled-adapters.test.ts` with the table and the three assertions per pair described above.
2. Run `$janissary/scripts/run.mjs check-diff`.
3. Confirm the test is effective: temporarily change the expected command for one pair so it no longer comes from `acpLaunchForEntry` but from a name neither package declares, see the bin assertion fail, and revert.
4. Update `product/specs/acp.md` with one sentence stating that the bundled adapters are pinned to exact versions and the names a role launch runs are the ones those pinned packages declare.

## Tests

`src/acp/bundled-adapters.test.ts`, for each of claude and codex:

- The launch command is among the installed adapter package's declared bin names.
- The root `package.json` pins the adapter package to an exact version.
- The installed adapter package's version equals the pinned version.

The existing `src/acp/launch.test.ts`, `src/acp/command-path.test.ts`, and `src/acp/manager-fallback.test.ts` stay unchanged and must keep passing.

## Out of scope

- Any production code change to `launch.ts` or `command-path.ts`, such as deriving the command from the package's `bin` field at runtime.
- Hoisted layouts in which the adapters are installed outside the install's own `node_modules`; there the test would fail to find the adapters' `package.json`, which is the desired loud failure.
- Checking `package-lock.json` or the `.bin` symlinks themselves.
