# Add the all-or-none ssh export operation
**Complexity: 5/10** — ~100 added lines, 13 requirements, 13 scenarios, 2 new units, no existing production files edited (p=5.43)

## Goal

Make the managed section of an ssh config mirror the saved catalog, skipping names that clash outside the section and refusing an unusable catalog. It is the eighth piece of `import-openssh-aliases-into-the-hosts-tab.md`, the source plan. It consumes the section splicer from `import-openssh-aliases-into-the-hosts-tab-3-managed-section-splice.md` and the file access from `import-openssh-aliases-into-the-hosts-tab-6-ssh-config-file-access.md`; subplan 10 calls it from commands and subplan 11 from intents, both through the shared runner in `ssh-intents.ts`.

## Requirements

1. Export rewrites the managed section to hold every saved host, with no dialog and no per-host choice ("the export is all or none, without dialog").
2. A saved host whose name matches, ignoring case, a literal `Host` alias outside the managed section is skipped ("Skip clashes, mirror catalog").
3. Section entries whose names are no longer saved are dropped ("Skip clashes, mirror catalog").
4. Section entries whose values differ from the catalog are overwritten with the catalog values ("Skip clashes, mirror catalog").
5. A saved host's path is not exported ("Drop silently").
6. A successful export reports `Exported 5 hosts to <path>; skipped 1.`, and uses `host` for one ("One summary line").
7. The `; skipped N` part of an export report appears only when something was skipped ("One summary line").
8. When there are no saved hosts and the file has no complete section, nothing is written and the report is `No hosts to export.` ("Notification, no dialog").
9. When there are no saved hosts but a section exists, Export empties it ("Skip clashes, mirror catalog").
10. A failed export write reports `Could not write ssh config <path>: <problem>.`, with `<path>` the display path passed in and `<problem>` the word from `writeSshConfigFile` ("Could not write …").
11. When the saved-hosts file in effect is unusable, Export writes nothing and reports `Cannot export hosts: <path> is unusable — fix it by hand.`, where `<path>` is the path of that hosts file from the `readHostsFile` result, in addition to the usual `Hosts file <path> is unusable: <problem>.` notice, which reaches the caller's notify callback (final-phase answer: "Refuse, mirror wording"; source plan Requirement 56).
12. The operation is named `exportSshHosts` and takes the root, home, resolved target path, display path, and a notify callback as plain arguments (source plan Implementation step 5).
13. The operation returns a result with an `ok` discriminant: a success carrying the report text of Requirements 6 to 9, or a failure carrying only the error text of Requirements 10 and 11, mirroring `HostsChange<T>` at `src/plugins/hosts/hosts-file.ts:17` `| { ok: false; error: string }` (source plan Implementation step 5).

## Design decisions

Subplans 1, 2, 3, 4 and 6 land before this one: subplan 3's section module imports the tokenizer from subplan 1 and mirrors the alias rules from subplan 2, and subplan 6 needs the create-mode parameter from `import-openssh-aliases-into-the-hosts-tab-4-atomic-create-mode.md`. `import-openssh-aliases-into-the-hosts-tab-10-command-runtime.md` and `import-openssh-aliases-into-the-hosts-tab-11-intent-registration.md` consume the outcome, so they land later.

- The new module is `src/plugins/hosts/export-ssh.ts`, beside `export-ssh.test.ts`. Like `import-ssh.ts` from `import-openssh-aliases-into-the-hosts-tab-7-import-operation.md`, it sits in the parent hosts directory so it can reach `readHostsFile` and `sameHostName` through `./`; a `ssh-config/` module cannot (Assumption 3). Name the operation `exportSshHosts` to mirror `importSshHosts`, so subplan 10's shared runner has one stable symbol to import.
- Export reads the catalog with `readHostsFile` first and refuses when its result is not `usable`, so an unreadable catalog can never empty the section (Assumption 1). The caller's notify callback is forwarded to that read: it is where the usual unusable-file notice comes from, and the operation emits no notice of its own (Requirement 11).
- Export reads the target with `readSshConfigFile`, treating `no such file` as empty text, obtains section ranges and the outside-section literal alias names from `findManagedSections`, skips catalog hosts whose names `sameHostName` matches in that outside list, serializes the remaining hosts with `serializeManagedSection`, splices with `spliceManagedSection`, and writes with `writeSshConfigFile` (Assumptions 2, 4 and 5). A name that is a literal alias only inside the managed section is not a clash and is written.
- Summary wording is one private helper so singular, plural, the optional skipped clause, and the empty forms cannot drift from the import operation's pattern. `<path>` in the report is the display path the caller passes in; the unusable-catalog line names the hosts-file path from the read result instead.
- An empty host list still serializes a section with only its header comment, which is how Requirement 9 empties an existing section. With no section at all, Requirement 8 means no file is created.
- The outcome follows the `HostsChange<T>` pattern with success text or failure text only: export never writes the catalog, so it carries no hosts to publish. The operation calls neither `publish` nor any notification of its own; the callers in subplans 10 and 11 do that (Requirements 12 and 13). Keep the module under 200 code lines and extract the summary helper to `src/plugins/hosts/export-ssh-report.ts`, imported as `./export-ssh-report.js`, if implementation passes 180.

## Preserved behavior

None found.

## Assumptions

1. A usable catalog read is signaled by `usable: true`: `src/plugins/hosts/hosts-file.ts:104` `if (effective !== undefined) {` and `:105` `return { hosts: effective.hosts, path: effective.filePath, usable: true, problems };`.
2. Catalog reads report problems through a callback: `src/plugins/hosts/hosts-file.ts:87` `export function readHostsFile(root: string, home: string, notify?: HostsNotify): HostsRead {`.
3. A concrete server plugin cannot import host internals through `../`: `eslint.plugin-boundaries.mjs:36` `regex: String.raw\`^\.\./(?!(?:api\.js|files\.js|`; the operation therefore sits in `src/plugins/hosts/` and uses `./` imports.
4. The section finder, outside-alias list, serializer, and splicer are delivered as `findManagedSections`, `serializeManagedSection`, and `spliceManagedSection` from `src/plugins/hosts/ssh-config/section.ts` by `import-openssh-aliases-into-the-hosts-tab-3-managed-section-splice.md:31` `` exports three functions named `findManagedSections`, `serializeManagedSection`, and `spliceManagedSection` ``.
5. Bounded reads, problem words, and symlink-safe writes are delivered as `readSshConfigFile` and `writeSshConfigFile` from `src/plugins/hosts/ssh-config-file.ts` by `import-openssh-aliases-into-the-hosts-tab-6-ssh-config-file-access.md:26` `` Export exactly two functions, named `readSshConfigFile` and `writeSshConfigFile` ``.
6. A stored `path` becomes `-t` plus a remote command rather than an ssh destination field: `src/ssh-saved-host.ts:42` `if (host.path !== undefined) prefix.push('-t');` and `:44` `const remote = host.path === undefined ? [] : [shellQuote(remoteCommand(host.path))];`.

## Existing functionality

1. Catalog reads with a `usable` flag and a problem callback: `src/plugins/hosts/hosts-file.ts:87` `export function readHostsFile(`.
2. Case-insensitive name comparison: `src/plugins/hosts/hosts-values.ts:90` `export function sameHostName(`.
3. The managed-section finder and outside-alias list from `import-openssh-aliases-into-the-hosts-tab-3-managed-section-splice.md:31` `` exports three functions named `findManagedSections`, `serializeManagedSection`, and `spliceManagedSection` ``.
4. The section serializer from `import-openssh-aliases-into-the-hosts-tab-3-managed-section-splice.md:31` `` exports three functions named `findManagedSections`, `serializeManagedSection`, and `spliceManagedSection` ``.
5. The section splicer from `import-openssh-aliases-into-the-hosts-tab-3-managed-section-splice.md:31` `` exports three functions named `findManagedSections`, `serializeManagedSection`, and `spliceManagedSection` ``.
6. Bounded reads with problem words and symlink-safe writes from `import-openssh-aliases-into-the-hosts-tab-6-ssh-config-file-access.md:26` `` Export exactly two functions, named `readSshConfigFile` and `writeSshConfigFile` ``.
7. The discriminated success-or-error result to mirror: `src/plugins/hosts/hosts-file.ts:17` `| { ok: false; error: string }`.

## Implementation steps

Every step ends green under `$janissary/scripts/run.mjs check-diff`, which is both the build command and the check that proves the step green. This subplan changes two new files; every module they import exists once subplans 1, 2, 3, 4 and 6 have landed, so no reference is deferred to subplans 10 or 11.

1. Add `src/plugins/hosts/export-ssh.ts`. Export `exportSshHosts` implementing Requirements 1 to 13 with the arguments and outcome of Requirements 12 and 13. Import `readHostsFile` from `./hosts-file.js` and `sameHostName` from `./hosts-values.js`, the section functions from `./ssh-config/section.js`, and the file functions from `./ssh-config-file.js` — the `.js` form required by `eslint.config.mjs:135` `js: 'always'` — and use no `../` import (Assumption 3). Forward the notify callback to `readHostsFile`; refuse an unusable catalog before any read or write of the target; treat a missing target as empty text; compare outside-section aliases with `sameHostName`; serialize with `serializeManagedSection`; splice with `spliceManagedSection`; write with `writeSshConfigFile`. Keep the module under 200 code lines with the report-helper extraction if it passes 180. Build with `$janissary/scripts/run.mjs check-diff`; it is both the build command and the check that proves this step green.
2. Add `src/plugins/hosts/export-ssh.test.ts` with a temporary home and root removed in `afterEach`, as `src/plugins/hosts/catalog-commands.test.ts:26` `function directories(): { home: string; root: string } {` does, and cover Requirements 1 to 13 as listed under Tests, asserting the exact report text. Force the failed write by mocking `writeSshConfigFile` with `vi.mock('./ssh-config-file.js', ...)` rather than relying on `chmodSync` that a privileged runner may ignore. Build with `$janissary/scripts/run.mjs check-diff`; it is both the build command and the check that proves this step green, and confirm the whole server test project still passes.

## UI design

1. No user interface surface changes. The operation is server-side; the command path and intents arrive in subplans 10 and 11 and the buttons in `import-openssh-aliases-into-the-hosts-tab-12-client-buttons.md`.

## Tests

In `src/plugins/hosts/export-ssh.test.ts`, one case per group, each tied to its requirement:

- The section mirrors the catalog, dropping orphan entries and overwriting changed values, with no `path` line (Requirements 1, 3 to 5).
- A name that is a literal alias outside the section is skipped and counted; a name that is a literal alias only inside the section is written, because it is not a clash (Requirements 1 and 2).
- A missing target is created; a mocked failed write returns the exact `Could not write ssh config <path>: <problem>.` text with the display path (Requirements 1 and 10).
- One, several, and zero hosts produce the exact singular, plural, and empty reports, with and without a skipped clause (Requirements 6 to 8).
- With no saved hosts and an existing section, the section becomes just its header; with no saved hosts and no section, no file is created (Requirements 8 and 9).
- An unusable catalog is refused with the exact text, the usual `Hosts file <path> is unusable: <problem>.` notice reaches the callback, and the target file is untouched (Requirement 11).

## Out of scope

- No import operation, no path resolution, no command, no intent, no button, no publish, no notification of its own, and no catalog write.
- No new ssh setting, no live sync, and no tracking of which hosts came from an import.

## Verification

Run `$janissary/scripts/run.mjs check-diff`; lint, typecheck, and both test projects must pass with only these two new files.

Then run `npx vitest run --project server src/plugins/hosts/export-ssh.test.ts` and read the clash case. Confirm a name that is a literal alias outside the section is left out of the managed section and counted, that no `path` line appears, and that an unusable catalog leaves the target byte for byte unchanged. A failure looks like a replaced outside alias, an exported path, or an emptied section after an unusable read.

Then read `src/plugins/hosts/export-ssh.ts`: its only relative imports must be `./hosts-file.js`, `./hosts-values.js`, `./ssh-config/section.js`, and `./ssh-config-file.js`; it must call `readHostsFile` before touching the target; and it must contain no `publish` call and no notification of its own beyond forwarding the notify callback. No command or button calls this operation until subplan 10's runner and subplan 11's intents land, so there is no running-app end-to-end check here; that check belongs to subplan 10, as it does for `import-openssh-aliases-into-the-hosts-tab-7-import-operation.md`. A `../` import, a target write before the catalog read, or a self-published payload means the change was not made correctly.
