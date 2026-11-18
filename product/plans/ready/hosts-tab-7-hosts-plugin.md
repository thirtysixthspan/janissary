# Register the Hosts plugin and implement its server commands and intents

**Complexity: 7/10** — ~225 added lines, 15 requirements and 24 scenarios (p=6.55)

## Goal

Work unit 7 of [Hosts Tab](../complete/hosts-tab.md). Depends on [Select and persist the effective hosts file](../ready/hosts-tab-2-host-storage.md), [Open SSH tabs using saved names](../ready/hosts-tab-5-ssh-name.md).

## Implementation

- **Edit and delete (user decision).** Hosts can be created, edited, and deleted from the tab. Editing opens the same modal prefilled; every field, including the name, is editable, and a renamed entry replaces the old key in one atomic write. A new name colliding (case-insensitively) with another host is refused. Delete asks `Delete host <name>?`; confirming removes the entry in one atomic write. Open ssh tabs and sessions are unaffected by an edit or delete.
- **Command grammar (user decision).** `hosts` opens the single hosts tab, or focuses it. `hosts list` prints the hosts in effect as 2-space-indented JSON, an object keyed by name, in the current transcript; it prints `{}` when there are none or the file in effect is unusable. `hosts add <name> <[user@]host[:port]> [path]` creates a host, or replaces an existing one of that name (case-insensitive). `hosts remove <name>` deletes one. Any other form is refused with `Usage: hosts [list|add|remove].`; malformed `add`/`remove` forms print `Usage: hosts add <name> <[user@]host[:port]> [path]` and `Usage: hosts remove <name>`.
- **Command wording (user decision).** `Host <name> added.`, `Host <name> updated.` (an `add` that replaced an entry), `Host <name> removed.`, and `No host named "<name>".`
- **Error wording (user decision).** Save refused because the file in effect is unusable (modal, delete, or `hosts add/remove`): `Cannot save hosts: <path> is unusable — fix it by hand.` Write failure: `Could not write hosts.json at <path>.` Duplicate name on create or rename in the modal: `Host "<name>" already exists.` Invalid field: `Invalid <field> "<value>". Use letters, digits, and . - _ only.` (the path's message also allows `/ ~`; a port is digits only).

- **Refresh (user decision).** Writes Janissary makes — modal save, row delete, `hosts add`, `hosts remove` — update an open hosts tab immediately. Hand edits to either file appear on Refresh or when the tab regains focus, like the sessions tab. There is no file watcher.

- **Opening (feature text).** The `hosts` command opens the hosts tab. The tab is not dockable.
- **A bundled tab plugin (user decision, replacing the feature text).** The feature text said "core, not a plugin"; the user chose to build it with the tab-plugin machinery as an ordinary bundled plugin, listed by `plugins` like sessions, because that is the lowest-cost route and every capability it needs already exists.
- **Plugin-owned hosts file module (user decision).** The read/decode/write module lives in the plugin and core imports it, the precedent `src/acp/ask-role.ts` set by importing `src/plugins/roles/roles-file.ts`. No new topic or capability.
- **Row launch (user decision).** Opening a host row runs `ssh <name>` through the existing `dispatchLineWithOutput` capability, so the core ssh command is the only place a saved host becomes an ssh spawn.
- **Listing as JSON (feature text).** `hosts list` lists the host configurations as JSON.
- **Click to connect (feature text).** Opening a host row launches an ssh tab connecting to that host's destination.

An ordinary bundled tab plugin (user decision, replacing the feature text's "core, not a plugin"), shaped like the sessions and roles plugins and listed by `plugins` like them:

- Define the declaration in `src/plugins/hosts/manifest.ts` following `sessionsManifest` in `src/plugins/sessions/manifest.ts`. Use id and command `hosts`, tab label prefix `hosts`, an empty extension map and an empty notifications list. Declare `originTab`, `note`, `notifyUser`, `openOrFocusTab`, `updateTab`, `dispatchLineWithOutput`, `rejectRequest`, and `reportFailure`. The capability list omits `dockTab`. Use `noFileOpener` in the activation.
- Define the schema version, payload and guards in import-free `src/plugins/hosts/shared.ts`. Send sorted rows with name, printable destination, and optional user and path plus the effective file path. Define request guards for `refresh`, `open`, `save` and `delete`. Save requests carry the four modal field strings and carry the original name only for edits. The activation uses `defineIntents` from `src/plugins/api.ts:441` for dispatch and shape checks. Keep content validation in the shared storage validator from unit 1.
- In `src/plugins/hosts/activate.ts`, use one fixed instance key for `openOrFocusTab`, `updateTab` and tab-attributed notices. Follow `rememberRoot` in `src/plugins/roles/activate.ts:63` for the project root through `originTab`; `src/plugins/line-capabilities.ts:36` provides the launch root independently of tab cwd. Read that root and the operating-system home for each command and intent. Send newly reportable file problems through `notifyUser` using the shared memo. Return expected command failures through `rejectRequest` and use `note` for listing and successful command responses.
- Keep command grammar and mutation logic in focused plugin modules. Parse CLI argument counts before validation, split the optional user from the destination only for `add`, and let the shared field validator enforce field characters and port syntax. Run every write through one synchronous fresh-read, transform and atomic-write path. A case-insensitive command add replaces the match and uses the newly supplied key spelling in the result. Modal save distinguishes create from edit, allows a rename or case-only change of the original key, and refuses a collision with any other key. A vanished edit target or delete reports the missing-name wording above. Publish updated payloads only after successful writes or explicit reads for refresh.
- Return a JSON-compatible success object containing the saved name from the save intent. Use `rejectRequest` for expected validation or write errors so the client receives the original message as a rejected intent, as in `web/src/plugins/roles/useRoleCreation.ts`. Delete failures notify with the instance key and return a JSON-compatible failure outcome so the Confirm dialog can close. A successful delete returns a success outcome and the updated rows follow through `updateTab`. Refresh and row operations also return JSON-compatible results.
- For `open`, look up the requested name in the fresh effective catalog. Reject a stale name without dispatching a literal destination. Dispatch `ssh <name>` from the live owned tab with its canonical stored spelling. Use the existing line-only dispatch capability and handle its failure outcome, using the transcript suppression documented in unit 5.
- Register the server declaration and loader in `src/plugins/catalog.ts` and `src/plugins/loaders.ts`. Add a minimal usable client entry in `web/src/plugins/hosts/index.tsx` in the same change. The loader map in `web/src/plugins/registry.tsx:33` (`clientPluginLoaders`) requires every production plugin ID. Register the lazy Hosts entry in both registry tables with the matching schema version. The entry exports its default component and payload guard. It renders a focusable list of hosts with the empty message `No saved hosts`, supports row open and offers a Refresh control. Unit 8 develops that entry into the full list and form.

## Tests

Use colocated activation and shared guard tests. Cover valid and invalid command forms, exact output, single-tab reuse, formatted and empty listing, add and replacement, case-insensitive remove, missing targets, modal create, case-only rename, duplicate refusal, unusable effective file, write failure, and fresh reads preserving edits. Assert refresh and all successful mutations update the open tab. Test malformed project notification and fallback, stale row refusal, dispatch failure and transcript-free row launch. Extend registry tests for catalog and schema parity and cover the basic client's list, empty state and intent wiring. Document server behavior in `product/specs/hosts-tab.md`.

## Out of scope

Styled table, full keyboard interactions, modal forms, row actions and docking.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Execute `hosts add Box build.example:2222 /work`, `hosts list` and `hosts remove box` and inspect confirmation and files.
