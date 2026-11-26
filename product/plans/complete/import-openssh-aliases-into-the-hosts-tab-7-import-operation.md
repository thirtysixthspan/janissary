# Add the all-or-none ssh import operation
**Complexity: 5/10** — ~110 production lines, 15 requirements and 16 scenarios, no existing files edited (p=5.63)

## Goal

Turn parsed aliases into saved hosts in one catalog write, skipping clashes and invalid aliases and reporting the result. It is the seventh piece of `import-openssh-aliases-into-the-hosts-tab.md`, the source plan. It consumes the alias reader from `import-openssh-aliases-into-the-hosts-tab-2-effective-alias-reader.md` and the file access from `import-openssh-aliases-into-the-hosts-tab-6-ssh-config-file-access.md`; subplan 10 wires it to commands and subplan 11 to intents.

## Requirements

1. Import adds every importable alias as a saved host in one write, with no dialog and no per-alias choice ("the import is all or none, without dialog").
2. An imported host's destination is its effective `HostName`, or the alias name when none applies ("HostName, user, port").
3. An imported host's user and port are the alias's effective `User` and `Port` ("HostName, user, port").
4. No ssh setting other than `HostName`, `User`, and `Port` is imported ("HostName, user, port").
5. An alias whose name matches a saved host ignoring case is skipped and that saved host is left unchanged ("Skip both, import rest").
6. An alias whose name, user, host, or port fails the saved-host rules is skipped ("Skip both, import rest").
7. An alias whose reader record carries a non-empty `invalidToken` is skipped ("Expand %h and %%", subplan 2 Requirement 7).
8. Import never modifies or removes an existing saved host ("All existing Hosts tab").
9. A source read failure writes nothing and reports `Cannot read ssh config <path>: <problem>.`, with `<path>` the display path passed in and `<problem>` the word from the read ("Only a read or write failure writes nothing"; source plan Requirement 54).
10. An unusable catalog or a failed catalog write writes nothing and reports the `mutateHostsFile` error verbatim (source plan Requirement 18; `src/plugins/hosts/hosts-file.ts:157` and `:163`).
11. A successful import reports `Imported 3 hosts from <path>; skipped 2.`, uses `host` for one, and shows the `; skipped N` part only when something was skipped ("One summary line").
12. When no alias is importable, nothing is written and the report is `No aliases to import from <path>.`, with `; skipped N` before the period when something was skipped ("Cannot read / Nothing to" and "One summary line").
13. The operation takes root, home, resolved source path, and display path as plain arguments (source plan Implementation step 5).
14. The operation returns a success outcome with the written catalog, imported and skipped counts, and summary text, or a failure outcome with only the failure text, mirroring `HostsChange<T>` at `src/plugins/hosts/hosts-file.ts:17` (source plan Implementation step 5).
15. The clash and validity checks run inside one `mutateHostsFile` change using `sameHostName` and `validateHostFields` against the catalog as it is at write time (source plan Implementation step 5 and Design decisions).

## Design decisions

Depends on `import-openssh-aliases-into-the-hosts-tab-2-effective-alias-reader.md` and `import-openssh-aliases-into-the-hosts-tab-6-ssh-config-file-access.md`. The reader extends the tokenizer from `import-openssh-aliases-into-the-hosts-tab-1-ssh-config-tokenizer.md`, and the file access needs the create-mode parameter from `import-openssh-aliases-into-the-hosts-tab-4-atomic-create-mode.md`, so subplans 1, 2, 4 and 6 land before this one. `import-openssh-aliases-into-the-hosts-tab-10-command-runtime.md` consumes the outcome for commands and `import-openssh-aliases-into-the-hosts-tab-11-intent-registration.md` for intents, so they land later.

- The new module is `src/plugins/hosts/import-ssh.ts`, beside `import-ssh.test.ts`. It lives in the parent hosts directory so it can reach `hosts-values.ts` and `hosts-file.ts` through `./`; a `ssh-config/` module cannot (Assumption 4). The source plan's Implementation step 5 calls this file `ssh-import.ts`; this subplan uses `import-ssh.ts` to match the sibling export operation's `export-ssh.ts`, and no other subplan names this file.
- Export `importSshHosts` with the plain arguments and the outcome of Requirements 13 and 14. Read the source through `readSshConfigFile` from `ssh-config-file.ts` and get records from the alias reader that subplan 2 exports from `ssh-config/parse.ts`; do not reimplement either.
- Guard the read before the mutation: a read problem returns the Requirement 9 text without calling `mutateHostsFile`. Inside one `mutateHostsFile` change, skip a record with a non-empty `invalidToken`, skip a name that `sameHostName` matches in the catalog, and skip a record `validateHostFields` rejects; append every accepted host after every existing host, unchanged. The single change makes the clash check see the catalog at write time and leaves a failed write with no catalog change (Assumptions 1 to 3).
- Call `validateHostFields` with the alias name, the effective user or `undefined`, the destination, and `undefined` for the path. Build that destination with `formatDestination` at `src/plugins/hosts/hosts-values.ts:86` from the effective `HostName`, or the alias name when that is empty, and the effective `Port` only when one applies. An empty effective user or port means the field is absent, and the returned `SavedHost` is what the change appends (Assumptions 5 and 6).
- No ssh setting beyond the three is carried over. A saved host launches as `user@host` with an optional `-p <port>` and a remote command only when a `path` is stored; import stores no path, so `IdentityFile` and `ProxyJump` never apply (Assumptions 5 and 6).
- Summary wording lives in one private helper inside `import-ssh.ts` so singular, plural, the optional skipped clause, and the empty forms cannot drift. `<path>` is the display path the caller passes in; no path formatting happens here. If the module passes 180 code lines, move the helper to `src/plugins/hosts/import-ssh-report.ts` imported as `./import-ssh-report.js` rather than compacting code.
- The operation does not publish or notify; the callers in subplans 10 and 11 do that. A failure outcome carries the failure text only, so the caller can select note or refusal without needing a catalog.

## Preserved behavior

None found

## Assumptions

1. Every surface validates hosts with one function: `src/plugins/hosts/hosts-values.ts:60` `export function validateHostFields(`.
2. Host names compare without regard to case: `src/plugins/hosts/hosts-values.ts:90` `export function sameHostName(`.
3. Catalog writes read and rewrite the file in effect in one pass, returning an error string on a bad read, a refused change, or a failed write: `src/plugins/hosts/hosts-file.ts:149` `export function mutateHostsFile<T>(`.
4. A concrete server plugin cannot import host internals through `../` beyond the allowlist: `eslint.plugin-boundaries.mjs:36` `` regex: String.raw`^\.\./(?!(?:api\.js|files\.js| ``.
5. A saved host's ssh command uses the stored destination and an optional port: `src/ssh-saved-host.ts:39` `` const destination = host.user === undefined ? host.host : `${host.user}@${host.host}`; `` and `:41` `if (host.port !== undefined) prefix.push('-p', String(host.port));`.
6. A stored `path` adds `-t` and a remote command, which import never stores: `src/ssh-saved-host.ts:42` `if (host.path !== undefined) prefix.push('-t');`.

## Existing functionality

1. Shared host-field validation: `src/plugins/hosts/hosts-values.ts:60` `export function validateHostFields(`.
2. Case-insensitive name comparison: `src/plugins/hosts/hosts-values.ts:90` `export function sameHostName(`.
3. One-pass catalog mutation with an error string: `src/plugins/hosts/hosts-file.ts:149` `export function mutateHostsFile<T>(` and `:17` `| { ok: false; error: string }`.
4. The `host[:port]` destination form: `src/plugins/hosts/hosts-values.ts:86` `export function formatDestination(host: SavedHost): string {`.
5. The alias records, including the `invalidToken` marker, delivered by `import-openssh-aliases-into-the-hosts-tab-2-effective-alias-reader.md:28` `` Each alias record holds the first-spelling `name` and raw `hostName`, `user`, and `port` strings, empty for a setting no block supplied, plus an `invalidToken` string that is empty for a valid alias and holds the raw offending token including its `%` when invalid ``.
6. Bounded reads with problem words and symlink-safe writes delivered by `import-openssh-aliases-into-the-hosts-tab-6-ssh-config-file-access.md:26` `` Export exactly two functions, named `readSshConfigFile` and `writeSshConfigFile` ``.

## Implementation steps

Every step ends green under `$janissary/scripts/run.mjs check-diff`. This subplan changes two new files. Subplans 1, 2, 4 and 6 must land first: subplan 2 extends the tokenizer from subplan 1, and subplan 6 needs the create-mode parameter from subplan 4. Nothing here depends on subplans 8 through 13.

1. Add `src/plugins/hosts/import-ssh.ts`. Export `importSshHosts` implementing Requirements 1 to 15 with the plain arguments and outcome of Requirements 13 and 14. Import `validateHostFields`, `sameHostName` and `formatDestination` from `./hosts-values.js`, `mutateHostsFile` from `./hosts-file.js`, `readSshConfigFile` from `./ssh-config-file.js`, and the alias reader from `./ssh-config/parse.js` — the `.js` form required by `eslint.config.mjs:135` `js: 'always'` — and use no `../` import (Assumption 4). Build each destination with `formatDestination` as decided above. Guard the read, skip invalid and clashing records inside one `mutateHostsFile` change, and keep the module under 200 code lines with the summary-helper extraction if it passes 180. Build with `$janissary/scripts/run.mjs check-diff`; it is both the build command and the check that proves this step green.
2. Add `src/plugins/hosts/import-ssh.test.ts`. Use `mkdtempSync` scratch home and root removed in `afterEach`, as `src/plugins/hosts/catalog-commands.test.ts:26` `function directories(): { home: string; root: string } {` does, and force read and write errors with `vi.mock('node:fs', ...)`, as subplan 6's Tests section prescribes, rather than relying on `chmodSync` that a privileged runner may ignore. Cover Requirements 1 to 15 as listed under Tests, asserting the exact report text. Build with `$janissary/scripts/run.mjs check-diff`; it is both the build command and the check that proves this step green, and confirm the whole server test project passes.

## UI design

1. No user interface surface changes. The operation is server-side; subplan 10 adds the command path, subplan 11 registers the intents, and subplan 12 adds the buttons.

## Tests

In `src/plugins/hosts/import-ssh.test.ts`, one case per group, each tied to its requirement:

- A scratch config with `Host bad` and `User a@b`, then `Host web1 web2` with `HostName %h.corp.example` and `Port 2222`, then `Host db*` with `User dba`, then `Host *` with `User ops` last adds only `web1`, at destination `web1.corp.example`, user `ops` and port `2222`, in one `mutateHostsFile` write; a config with a literal alias and no `HostName` leaves the alias name as the destination (Requirements 1, 2, 3, 15).
- An `IdentityFile` and a `ProxyJump` in the config produce no saved field (Requirement 4).
- With `web2` saved at `old.example` first, a config holding `Host web2` with `HostName new.example` skips that alias and leaves `web2` at `old.example`; an invalid name, an invalid user such as `a@b`, an invalid host, and an invalid port each skip their alias; an alias whose record has a non-empty `invalidToken`, such as a `HostName` with `%n`, is skipped; all other aliases still import (Requirements 5, 6, 7, 8, 15).
- A forced source read failure calls no `mutateHostsFile`, writes nothing, and reports `Cannot read ssh config <path>: no such file.` with the display path (Requirement 9).
- A forced catalog write failure and an unusable catalog each leave the catalog unchanged and return the exact `mutateHostsFile` error from `src/plugins/hosts/hosts-file.ts:157` or `:163` (Requirement 10).
- One, several, and zero imported hosts produce `Imported 1 host from <path>.`, `Imported 3 hosts from <path>; skipped 2.`, `No aliases to import from <path>; skipped 2.`, and `No aliases to import from <path>.` exactly, as applicable (Requirements 11, 12).

## Out of scope

- No export operation, no section work, no path resolution, no command, no intent, no button, no publish, and no notification.
- No import of other ssh settings, no live sync, no tracking of which hosts came from an import, and no change to an existing saved host through import.

## Verification

Run `$janissary/scripts/run.mjs check-diff`; lint, typecheck, and both test projects must pass with only these two new files.

Then run `npx vitest run --project server src/plugins/hosts/import-ssh.test.ts` and read the clash case. That case saves `web2` at `old.example` before importing a config with a bad `User a@b`, `Host web1 web2` with `HostName %h.corp.example` and `Port 2222`, and a final `Host *` with `User ops`. Confirm `web2` still points at `old.example`, only `web1` was added at `web1.corp.example` with user `ops` and port `2222`, and the report reads `Imported 1 host from <path>; skipped 2.`. A failure looks like a replaced `web2`, an `IdentityFile` field in the catalog, or a catalog write after a source read failure. There is no running-app end-to-end check at this subplan because no command or button calls the operation yet; subplan 10 owns that check.
