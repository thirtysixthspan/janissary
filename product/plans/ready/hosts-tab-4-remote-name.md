# Resolve saved hosts in remote launch executors

**Complexity: 6/10** — ~94 added lines, 5 existing files and 12 scenarios (p=5.78)

## Goal

Work unit 4 of [Hosts Tab](../complete/hosts-tab.md). Depends on [Select and persist the effective hosts file](../ready/hosts-tab-2-host-storage.md), [Carry saved SSH ports through remote session transport](../ready/hosts-tab-3-remote-port.md).

## Implementation

- **`on <name>` lookup (user decision).** A token exactly matching a saved name (case-insensitive) uses the saved host, even when it is also a reachable hostname. A token containing `@` or `:` never matches a name and is parsed as an address, as today.
- **`on <name>` semantics (user decision).** `on <name>` behaves exactly like `on [user@]host[:path]` built from the saved host: `path` is the remote project root, and a host with no path walks up from the ssh login directory.
- **Lookup against an unusable file (user decision).** When the file in effect is unusable, `on <name>` uses the parsed literal hostname or alias and posts the once-per-problem `Hosts file <path> is unusable: <problem>.` notification.
- **Ports on remote launches (user decision).** A saved host's port is honored by `on <name>` for `shell`, `harness`, and `agent`: the remote launch passes it to ssh. A typed `on <address>` still accepts no port.

- Add a pure `resolveSavedHost(token, hosts)` beside `parseRemoteAddress` in `src/remote/address.ts:41`. Match bare names case-insensitively and use the stored spelling for `hostName`. Populate `destination` with `[user@]host`, `host` with the bare host, and the optional `port` and `path` from the entry. Build `address` as a parseable literal destination plus optional path. Unit 3 stores the port and name separately for replay.
- Put the shared execution-layer lookup in `src/remote/saved-host.ts`. It accepts the parsed address and initiating tab label, and reads the catalog at most once for an eligible bare token using `managers.tab.launchDir` and `homedir()`. Report newly observed problems through `notify(managers, 'manual', …)` from `src/notifications/index.ts:194`, including a skipped bad project file when home is usable. Return the original parsed address on a miss. Keep the import of the plugin-owned data module in this core helper to satisfy the host infrastructure import rule in `eslint.plugin-boundaries.mjs`.
- Harness. In `src/harness/manager.ts` at `open`, resolve the parsed `launch.remote` after identifying the creator and before building the spawn arguments. Pass the resulting address into `spawnTab` so its remote metadata and `startRemoteTab` use the same endpoint. Carry it through the automatic name retry so a hand edit midway cannot retarget the launch. `attachRemote` goes straight to `spawnTab` with the restored address and skips lookup. Leave `findRemoteClause` in `src/harness/command-parse.ts` pure.
- Shell. Resolve the explicit address after the existing parse and error check in `launchRemotePluginTab` in `src/plugins/launch-tab-remote.ts:35`. Use the resolved address throughout, including the retry, tab metadata and provisioning. Extract explicit address preparation to `src/plugins/launch-tab-saved-host.ts` to keep the launch file within the line limit. Adoption and joining continue to use their established channel without consulting the catalog. The shell plugin keeps sending its existing address request.
- Agent. Resolve the selector after the parse in `resolveRemoteAgentTarget` in `src/agent/remote-target.ts:23`. Apply the same endpoint comparison in both the source-tab and established-workspace branches. For a pathless saved selector, reuse only an attached, usable workspace with a case-insensitive destination match and the same configured port, treating an omitted port as the SSH configuration default. Explicit paths still provision a channel. Preserve literal selector matching and reuse of an existing channel's launch identity. New agent channels receive the resolved address, while implicit inheritance skips lookup.
- Update `product/specs/remote-server.md` and `product/specs/agent-command.md` to cover saved selectors, ports, literal fallback and workspace reuse.

## Tests

Extend `src/remote/address.test.ts` for case-insensitive lookup, port and path preservation, pathless entries, misses and disambiguation with `@` and `:`. Cover one catalog read and project-to-home notification and fallback in a colocated helper test. In `src/harness/manager.test.ts` and `src/plugins/launch-tab-remote.test.ts`, assert the resolved endpoint reaches the spawn and stays pinned on a name retry, and that replay or join uses its established address. In `src/agent/remote-target.test.ts`, cover both reuse branches with a matching saved endpoint, a different port, an explicit path and a literal selector.

## Out of scope

Plain SSH and Sessions UI.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Launch all three commands with a saved name for a controlled fixture, then with a literal address.
