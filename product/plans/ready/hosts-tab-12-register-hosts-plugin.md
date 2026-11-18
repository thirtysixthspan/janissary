# Register the bundled Hosts tab and connect commands

**Complexity: 6/10** — ~135 added production lines across 6 existing files, 19 test scenarios (p=6.262)

## Goal

Make the read and command flows available through a single installed Hosts plugin. Source plan: `product/plans/complete/hosts-tab.md`. Depends on `product/plans/ready/hosts-tab-8-ssh-tab-launch.md`, `product/plans/ready/hosts-tab-10-catalog-commands.md` and `product/plans/ready/hosts-tab-11-host-list-view.md`.

## Implementation

Add `hostsManifest` in `src/plugins/hosts/manifest.ts`. Follow `sessionsManifest` in `src/plugins/sessions/manifest.ts:12` for the `TAB_PLUGIN_API_VERSION`, plugin version and literal declaration shape. Set id, command, and label prefix to `hosts`, use `HOSTS_PAYLOAD_SCHEMA_VERSION`, and declare an empty `fileExtensions` object. Request `originTab`, `notifyUser`, `note`, `openOrFocusTab`, `updateTab`, `dispatchLineWithOutput`, `rejectRequest`, and `reportFailure`. The manifest exposes no topic or dock capability. In `src/plugins/hosts/activate.ts`, supply `isHostsPayload`, `noFileOpener('hosts')`, a command handler and a `defineIntents` table for Refresh and Open. `defineIntents` already separates malformed client requests from an invalid server-owned tab payload (`src/plugins/define-intents.ts:28`).

Use `originTab()?.root` and `homedir()` for all catalog operations. `originTab` returns the application launch directory in `root` even for a workspace or remote tab (`src/plugins/line-capabilities.ts:36`). If the origin has closed, decline the request rather than using the process working directory. Map the decoded, sorted hosts and effective path to `HostsPayload` once per read or write result. Format the destination as `host[:port]` and send empty strings for absent user or path.

Use one instance key and title, both `hosts`. A bare command reads once and calls `updateTab` with the fresh payload before `openOrFocusTab`. Updating a missing instance is a no-op, and the existing-instance branch in `src/tab/openers.ts:106` (`openPluginTab`) focuses without calling the opening factory. This sequence refreshes an already open instance even if it stays active. Route other forms through `runCatalogCommand`. Send ordinary text through `note` and expected refusals through `rejectRequest`, following the command outcome contract from plan 10. After a successful write, publish the written catalog and selected path through `updateTab` without reading it again. Refresh performs a fresh read and publishes through the same update path. The shared file reader owns notification deduplication. In an intent, pass `{ tab: 'hosts' }` to `notifyUser` so the message is attributed to the answering tab rather than its original launcher (`src/plugins/context.ts:130`).

For Open, check the requested name against the current server-owned payload and look it up again in the effective catalog. Reject an unoffered name as an invalid request. If an offered row is gone, publish the fresh payload and notify `No host named "<name>".` on Hosts. Dispatch the matched stored spelling via `dispatchLineWithOutput` and let the core SSH command resolve and spawn it. In `SshManager.run` (`src/ssh-manager.ts:18`), make a saved-name miss from the Hosts origin return the same missing-row error without spawning, in case the file disappears between the intent's read and SSH's read. Retain literal fallback for typed SSH. Use the immediate error result from plan 8, or the captured output for a refused dispatch, to notify the Hosts tab. An unclaimed dispatch notifies `Could not open host "<name>".` Return `null` for a handled intent. The new SSH tab's recording remains the record of a successful row launch.

The generic `tab dock` operation currently accepts all plugin views (`isDockableTab`, `src/tab/dock.ts:6`), and the `setDock` RPC reaches `setDock` in `src/tab/operations.ts:49` directly. Apply one shared Hosts-specific placement exclusion at both server entry points before either changes a tab. Keep all other plugins' manual docking behavior and keep the host Split action available. `hosts left` and `hosts right` follow the existing unsupported-form outcome from plan 10.

Add the manifest to `tabPluginCatalog` in `src/plugins/catalog.ts`. In the same change, add literal lazy entries in `tabPluginLoaders` in `src/plugins/loaders.ts` and in `clientPluginLoaders` and `clientPluginRegistry` in `web/src/plugins/registry.tsx`. The loader and registry maps are typechecked against `ProductionTabPluginId`. Use the schema literal `1` in the client registration so the shared contract stays in the lazy chunk. The host creates the command from the manifest through `createPluginCommands` (`src/plugins/command-adapter.ts:39`). Add the command and its available behavior to `help/hosts.md`, the alphabetical command table in `help/commands.md`, and the initial `product/specs/hosts-tab.md`.

## Tests and verification

In `src/plugins/hosts/activate.test.ts`, cover a fresh open, repeat focus and refresh, project-root selection from a workspace, plain command output and refusals, publication after each successful mutation, unchanged payload after refusal, explicit Refresh, invalid intent input, offered and stale row checks, dispatch success and refusal, and notification attribution. Extend `src/ssh-manager.test.ts` for a catalog miss between the two reads with no literal spawn. Cover both generic docking entry points and an unchanged manual-dock path for another plugin in the colocated tab tests. Verify command routing in `src/commands.test.ts`, catalog discovery in `src/commands/plugins.test.ts`, and add a schema and lazy guard check to `web/src/plugins/registry.test.tsx`.

Run `$janissary/scripts/run.mjs check-diff`, including the server loader and frozen compatibility fixtures. Run `npm run build:web` and verify the Hosts client entry loads in a separate chunk. In a scratch app, open `hosts`, add an entry via `hosts add`, and click its row twice. Confirm the existing Hosts tab updates in place, the SSH tab and recording open, and generic docking leaves Hosts in the center.

## Out of scope

Create, edit and delete through row controls.
