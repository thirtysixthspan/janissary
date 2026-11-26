# Import and export OpenSSH aliases in the Hosts tab

**Complexity: 7/10** — ~650 added lines, 55 requirements, 45 test scenarios across 5 edited files and 7 new modules (p=8.09)

## Goal

Let a user move named hosts between their local OpenSSH configuration and Janissary's saved-hosts catalog in one step, without retyping them. The feature text asks for importing "concrete aliases and their supported hostname, user, and port settings". Planning added the other direction, "export back out is in scope". It then cut the scope down three times: "import and export should only work locally", "the import is all or none, without dialog", and "the export is all or none, without dialog". Today the Hosts tab accepts hosts one at a time, through the New host form or `hosts add` (`product/specs/hosts-tab.md`), and nothing writes ssh config. After this change, one Import action adds every importable alias. One Export action rewrites a Janissary-managed section of the ssh config to mirror the saved catalog. Anything that can't be carried over is skipped and counted in the summary line.

## Requirements

Reading ssh config:

1. The Import and Export buttons use `~/.ssh/config` only ("~/.ssh/config only").
2. `Include` directives are ignored ("~/.ssh/config only", option 2: "Include lines are ignored").
3. Each name on a `Host` line that has no `*` or `?` and does not start with `!` is a literal alias ("Literal names only").
4. Pattern names and `Match` blocks are never aliases ("Literal names only").
5. An alias's `HostName`, `User`, and `Port` are its effective values within the file: every `Host` block whose patterns match the alias applies in file order, including `*`, `?`, and `!` negation ("Effective, like ssh").
6. For each of those three settings, the first value obtained wins ("Effective, like ssh").
7. Settings inside a `Match` block never contribute; everything from a `Match` line up to the next `Host` line is skipped ("Ignore Match blocks").
8. In an effective `HostName`, `%h` expands to the alias name and `%%` to a literal `%` ("Expand %h and %%").
9. Any other `%` token makes the alias invalid ("Expand %h and %%").
10. Aliases are folded by name ignoring case, keeping the spelling of the first appearance ("One row, first spelling").

Import:

11. Import adds every literal alias as a saved host in one write, with no dialog and no per-alias choice ("the import is all or none, without dialog").
12. An imported host's destination is the alias's effective `HostName`, or the alias name when none applies ("HostName, user, port").
13. An imported host's user and port are the alias's effective `User` and `Port` ("HostName, user, port").
14. No other ssh setting is imported ("HostName, user, port").
15. An alias whose name matches a saved host ignoring case is skipped, and the saved host is left unchanged ("Skip both, import rest").
16. An alias whose name, user, host, or port fails the saved-host rules is skipped ("Skip both, import rest").
17. Import never modifies or removes an existing saved host ("All existing Hosts tab").
18. A read failure or a catalog write failure writes nothing ("Skip both, import rest": "Only a read or write failure writes nothing").
19. A successful import reports `Imported 3 hosts from <path>; skipped 2.`, with `host` for one, and the `; skipped N` part only when something was skipped ("One summary line").
20. When no alias is importable, nothing is written and the report is `No aliases to import from <path>.`, followed by `; skipped N` before the period when something was skipped ("Cannot read / Nothing to" and "One summary line").
21. The Hosts tab's rows update from the written catalog, as after `hosts add` (`product/specs/hosts-tab.md` § Editing hosts).

Export:

22. Export rewrites the managed section to hold every saved host, with no dialog and no per-host choice ("the export is all or none, without dialog").
23. The managed section is the text from a `# BEGIN janissary hosts` line through the next `# END janissary hosts` line ("Managed section").
24. An unmatched BEGIN or END line is ordinary text ("Treat as no section").
25. A saved host whose name matches, ignoring case, a literal `Host` alias outside the managed section is skipped ("Skip clashes, mirror catalog").
26. Section entries whose names are no longer saved are dropped ("Skip clashes, mirror catalog").
27. Section entries whose values differ from the catalog are overwritten with the catalog values ("Skip clashes, mirror catalog").
28. Export leaves every byte outside the managed section untouched ("Managed section").
29. When the file has no complete section, Export appends one after the file's last line ("End of the file").
30. When the file has two or more complete sections, Export rewrites the first and removes the later ones ("Merge into one").
31. The line after `# BEGIN janissary hosts` reads `# Managed by Janissary; edits inside this section are replaced on export.` ("Plus a header comment").
32. Each exported host is written as `Host <name>`, then `    HostName <host>`, then `    User <user>` and `    Port <port>` only when saved, with a four-space indent ("Plus a header comment").
33. Exported hosts are separated by one blank line and written in name order ignoring case ("Plus a header comment").
34. A saved host's path is not exported ("Drop silently").
35. A missing target file is created with mode `0600` ("Create it").
36. A missing parent directory is created with mode `0700` ("Create it").
37. A target that is a symlink is written through to the file it points at, so the link survives ("Resolve link, then atomic").
38. The target is replaced atomically ("Resolve link, then atomic").
39. A successful export reports `Exported 5 hosts to <path>; skipped 1.`, with `host` for one, and the `; skipped N` part only when something was skipped ("One summary line").
40. When there are no saved hosts and the file has no complete section, nothing is written and the report is `No hosts to export.` ("Notification, no dialog").
41. When there are no saved hosts but a section exists, Export empties it, since the section mirrors the catalog ("Skip clashes, mirror catalog").
42. A failed write reports `Could not write ssh config <path>: <problem>.` ("Could not write …").

Commands and paths:

43. `hosts import [file]` runs the import against `~/.ssh/config`, or against `[file]` when given ("`hosts import <file>` command to allow for other files").
44. `hosts export [file]` runs the export against `~/.ssh/config`, or against `[file]` when given ("Button + `hosts export`").
45. Neither verb opens or focuses the Hosts tab. Like `hosts add`, each refreshes an open Hosts tab and answers in the transcript it was typed in (`product/specs/hosts-tab.md` § Commands; the dialog the verbs used to open is gone).
46. Both verbs match regardless of case (`product/specs/hosts-tab.md` § Commands: "Every verb matches regardless of case").
47. A file operand of `~`, or one starting with `~/` or `$HOME/`, resolves to the home directory or a path under it. One starting with `$root` resolves against the project root, and one starting with `$workspace` against `$root/.janissary/workspace` ("~, $root, $HOME, $workspace").
48. A relative operand is tried first against the working directory of the tab the command was typed in, then against the project root, and the first existing file wins ("cwd, then project").
49. A relative export operand that exists in neither place is created in the typing tab's working directory ("Create it").
50. The file operand may be wrapped in double quotes, and the text between them, which may contain spaces, is the path. Inside quotes there are no escapes. An unquoted operand is one whitespace-free token ("Quoted paths").
51. An unmatched double quote, or any text after the operand, gives the verb's usage line ("Quoted paths").
52. Typed in a remote tab, both verbs refuse with `hosts import and hosts export work only in local tabs.` before reading or writing anything ("Refuse in remote tabs").
53. The bare usage line becomes `Usage: hosts [list|add|remove|import|export].`. A malformed import gives `Usage: hosts import [file]` and a malformed export gives `Usage: hosts export [file]` ("Extend + own lines").
54. A missing or unreadable file to import is reported as `Cannot read ssh config <path>: <problem>.`, with `<problem>` such as `no such file`, `is a directory`, `permission denied`, or `file is too large`. A missing export target is not an error: Requirement 35 applies ("Cannot read / Nothing to" and "Create it").
55. A button-started report is a notification attributed to the Hosts tab. A command-started success is a transcript note, and a command-started failure is a refusal in that transcript. `<path>` is always shown abbreviated, with the home directory as `~` and the project root as `$root` ("No dialog, notification" and "One summary line").

Added in the final question phase:

56. When the saved-hosts file in effect is unusable, Export writes nothing and reports `Cannot export hosts: <path> is unusable — fix it by hand.`, where `<path>` is that hosts file. The usual `Hosts file <path> is unusable: <problem>.` notice still appears (final-phase answer: "Refuse, mirror wording").

## Design decisions

- Import and export are single actions with no dialog, no preview, and no per-row choice (user answers: "the import is all or none, without dialog" and "the export is all or none, without dialog"). This supersedes every earlier dialog decision: checkboxes, row statuses, defaults, primary-button rules, focus, re-entry, and stale-preview handling.
- Import skips any alias that clashes with a saved name or fails the host rules, and imports the rest in one catalog write (user answer: "Skip both, import rest"). The skip test uses `sameHostName` and `validateHostFields` inside one `mutateHostsFile` change function, so the clash check runs against the catalog as it is at write time (Assumptions 1 to 3).
- Export makes the managed section mirror the catalog, minus hosts whose names are literal aliases elsewhere in the file (user answer: "Skip clashes, mirror catalog").
- Imported hosts take the alias's `HostName`, `User`, and `Port`. Settings such as `IdentityFile` or `ProxyJump` stop applying once the saved host is launched, because a saved host launches as `ssh -p <port> -- <user>@<host>` (user answer: "HostName, user, port"; Assumption 4).
- A new section is appended at the end of the file. A `Host *` block earlier in the file can therefore still supply values first (user answer: "End of the file").
- Import and export work only on local files, and a remote tab refuses both verbs by checking `originTab().remote` first (user answers: "only work locally" and "Refuse in remote tabs"; Assumption 6).
- The ssh config logic lives in a new namespace directory, `src/plugins/hosts/ssh-config/` (user answer: "1 but new namespace src/plugins/hosts/ssh-config"). Its modules import nothing through `../`, because the plugin import boundary refuses any `../` path not on its allowlist (Assumption 5). Conversion into saved hosts happens in the parent hosts modules, which can reach `hosts-values.ts`.
- The buttons fire two new intents, `import` and `export`, each with an empty payload. Each runs the whole operation, publishes the catalog through the existing `publish` when the catalog changed, reports through `readNotify(capabilities, true)`, and returns `null`, like `deleteRow` at `activate.ts:96`. The payload shape and its schema version are unchanged.
- The verbs follow the `hosts add` path in `runCommand`. A successful run is a `mutation`-style outcome, which publishes and then notes the summary, and a failure is a `refusal` (Existing functionality 3).
- Reads are bounded at 1 MiB, reported as `file is too large` beyond that. The ceiling is far above any real ssh config and can rise without other changes.
- The file operand is one whitespace-free token, or one double-quoted string. Because `parseCatalogCommand` splits on whitespace, the new verbs read their operand from the raw text after the verb. `~user` forms are not expanded and resolve as relative paths (user answer: "Quoted paths").
- A write resolves an existing symlinked target, then replaces the real file atomically, and a new file is created with mode `0600` (user answer: "Resolve link, then atomic"). `atomicWriteFile` gains an optional create mode, used only when the target does not yet exist, and `replaceFileAtomically` in `src/plugins/files.ts` passes it through (Assumption 7).
- A repeated click while an operation runs is not guarded. Both operations are synchronous local file work, and a second import only skips everything the first added, so it writes nothing new.

## Preserved behavior

1. Opening a Hosts row launches ssh with the stored spelling. Import and export must not change how a saved host is launched or which spelling reaches `ssh`. Pinned by `src/plugins/hosts/activate.test.ts` › `dispatches the stored spelling of an offered row and stays quiet on success`.
2. Creating, editing, and renaming through the host form writes one sorted catalog. The new intents must not change the `save` intent's duplicate, missing-host, or rename handling. Pinned by `src/plugins/hosts/activate.test.ts` › `renames a host by case alone in one write`.
3. A refused catalog mutation leaves the payload unchanged. A failed import must not publish a payload or write the hosts file. Pinned by `src/plugins/hosts/activate.test.ts` › `leaves the payload alone when a mutation is refused`.
4. `hosts list` prints exact two-space JSON. Adding verbs must not change its output. Pinned by `src/plugins/hosts/catalog-commands.test.ts` › `returns exact two-space JSON for a list`.
5. `hosts add` replaces only a case-folded match under the newly typed spelling. Import must not reuse that replace path: a clashing alias is skipped, never replaces. Pinned by `src/plugins/hosts/catalog-commands.test.ts` › `replaces only a case-folded match under the newly supplied spelling`.
6. Malformed `hosts` requests never touch storage. A malformed `import` or `export` must not read or write any file. Pinned by `src/plugins/hosts/catalog-commands.test.ts` › `skips storage for malformed requests`.
7. Cmd+N or Ctrl+N opens the new-host form while the list is focused. The new buttons must not take that chord or add another. Pinned by `web/src/plugins/hosts/HostList.test.tsx` › `opens a new host form on %s while the list has focus`.
8. The empty list keeps its metadata actions. The new buttons must not hide Refresh, New host, or Split when there are no saved hosts. Pinned by `web/src/plugins/hosts/HostList.test.tsx` › `reports an empty list without headings but keeps the metadata actions available`.
9. An atomic replace keeps an existing file's mode. A create mode must not change the mode of a file that already exists. Pinned by `src/atomic-write.test.ts` › `preserves an existing file mode`.

## Assumptions

1. Every surface validates hosts with one function: `src/plugins/hosts/hosts-values.ts:60` `export function validateHostFields(`.
2. Catalog writes read and rewrite the file in effect in one pass: `src/plugins/hosts/hosts-file.ts:149` `export function mutateHostsFile<T>(`.
3. Host names compare without regard to case: `src/plugins/hosts/hosts-values.ts:90` `export function sameHostName(`.
4. A saved host launches with its port and `user@host` only, and no other ssh option: `src/ssh-saved-host.ts:38` `export function buildSavedSshInvocation(host: SavedHost): SshParsed {`.
5. A concrete server plugin may import nothing through `../` except the allowlisted host modules: `eslint.plugin-boundaries.mjs:38` `` regex: String.raw`^\.\./(?!(?:api\.js|files\.js| ``.
6. A plugin learns the typing tab's working directory, project root, and whether it is remote from `originTab()`: `src/plugins/api-origin-tab.ts:22` `export type TabPluginOriginTab = {`, whose `remote?: true;` field marks a remote tab.
7. The host's atomic write is temp-file-and-rename, keeping only an existing file's mode: `src/atomic-write.ts:8` `export function atomicWriteFile(file: string, content: string | Uint8Array): void {`.

## Existing functionality

1. The Hosts tab declares its intents in one table: `src/plugins/hosts/activate.ts:140` `intent: defineIntents('hosts', isHostsPayload, {`.
2. The `hosts` command parses verbs purely before any I/O: `src/plugins/hosts/catalog-commands.ts:52` `export function parseCatalogCommand(argument: string): CatalogParse {`.
3. A catalog-changing command publishes and then notes its text: `src/plugins/hosts/catalog-commands.ts:21` `| { kind: 'mutation'; text: string; hosts: SavedHost[]; path: string };`.
4. Catalog publishes go through one helper: `src/plugins/hosts/activate.ts:38` `function publish(capabilities: TabPluginServerCapabilities, payload: HostsPayload): void {`.
5. Hosts-tab notifications are attributed by one helper: `src/plugins/hosts/activate.ts:48` `function readNotify(capabilities: TabPluginServerCapabilities, owned: boolean): (message: string) => void {`.
6. An intent that reports by notification and returns `null` already exists: `src/plugins/hosts/activate.ts:96` `function deleteRow(`.
7. Formatting a saved destination as `host[:port]` already exists: `src/plugins/hosts/hosts-values.ts:86` `export function formatDestination(host: SavedHost): string {`.
8. Plugins replace files atomically through the allowlisted host module: `src/plugins/files.ts:92` `export function replaceFileAtomically(filePath: string, content: Uint8Array): void {`.
9. Glob matching with configurable options is an installed dependency already in use: `src/file-glob/match.ts:1` `import { Minimatch } from 'minimatch';`.
10. Symlink-preserving atomic replacement is already done for workspace writes: `src/file-navigator/filesystem-port.ts:212` `let target = path.join(realpathSync(path.dirname(absolute)), path.basename(absolute));`.
11. The `~` and `$root` prefix expansion exists in core, though the plugin boundary keeps it out of reach: `src/paths.ts:15` `export function expandUserPath(input: string, context: RootContext): string {`.
12. Fire-and-forget intents from the metadata bar already exist: `web/src/plugins/hosts/HostList.tsx:61` `const refresh = () => { fireIntent({ intent }, 'refresh', {}); };`.
13. The metadata bar's icon buttons sit before the Split control: `web/src/plugins/hosts/HostList.tsx:120` `<button type="button" title="New host" aria-label="New host" onClick={() => setEditing('new')}>`.

## Implementation steps

Each step ends green under `$janissary/scripts/run.mjs check-diff`.

1. **Pure ssh config reader.** Add `src/plugins/hosts/ssh-config/parse.ts`. It tokenizes config text into `Host` and `Match` blocks, following ssh's keyword rules: case-insensitive keywords, `=` or whitespace separators, quoted arguments, and `#` comments. It lists literal aliases in first-appearance order, folded by case, and computes each alias's effective `HostName`, `User`, and `Port` with first-match semantics, `!` negation, `*`/`?` wildcards, `Match` skipping, and `%h`/`%%` expansion. Match each pattern with `Minimatch` from the already-installed `minimatch` dependency, as `src/file-glob/match.ts:1` does, with `nocase`, `dot`, `nobrace`, `noext`, and `nonegate`. The parser strips the leading `!` itself. This is a deliberate shortcut: minimatch still treats `[…]` and `\` as syntax where ssh treats them literally, and such characters are rare in `Host` patterns. If one ever matters, swap in a literal-only `*`/`?` matcher behind the same call. The reader returns raw strings plus a marker for an unexpandable token. It imports nothing through `../`. Colocated test: `parse.test.ts`. Build and check with `$janissary/scripts/run.mjs check-diff`.
2. **Pure managed-section splice.** Add `src/plugins/hosts/ssh-config/section.ts`. It finds complete BEGIN/END pairs and lists literal aliases outside all sections; it can reuse step 1's tokenizer, since both live in the same directory. It serializes a section from host entries in the format of Requirements 31 to 33. It splices that section into file text in one of three ways: rewrite the first complete section, remove later ones, or append at the end when there is none. Bytes outside sections stay identical. It imports nothing through `../`. Colocated test: `section.test.ts`. Build and check with `$janissary/scripts/run.mjs check-diff`.
3. **Create mode for atomic writes.** Give `atomicWriteFile` in `src/atomic-write.ts` an optional create mode, applied only when the target does not exist. An existing file keeps its own mode as today. Pass it through an optional third parameter of `replaceFileAtomically` in `src/plugins/files.ts`. Every existing caller passes nothing and is unchanged. Test: a create-mode case in `src/atomic-write.test.ts`. Build and check with `$janissary/scripts/run.mjs check-diff`.
4. **Path resolution and file access.** Add `src/plugins/hosts/ssh-config-target.ts`. It holds a pure resolver that expands the Requirement 47 prefixes, tries the bases of Requirement 48, and produces a local absolute path plus its abbreviated display form. The plugin cannot import `src/paths.ts` (Assumption 5), so it re-implements the small prefix expansion of `expandUserPath` (`src/paths.ts:15`) and the `~`/`$root` abbreviation. Those few lines are a deliberate duplicate. A third plugin needing them is the signal to add `src/paths.ts` to the boundary allowlist instead. Add `src/plugins/hosts/ssh-config-file.ts` for effects. A read is bounded at 1 MiB and maps `ENOENT`, `EISDIR`, `EACCES`, and oversize to `no such file`, `is a directory`, `permission denied`, and `file is too large`; any other error maps to `could not be read`. A write resolves an existing symlinked target the way `LocalFileSystemPort.writeFile` does at `src/file-navigator/filesystem-port.ts:212` to `:214`, using `lstatSync` and then `realpathSync`. It creates a missing parent with `mkdirSync` (recursive, mode `0700`) and writes through `replaceFileAtomically` with create mode `0600`. A write error maps to the same problem words. Tests sit beside each file, using a temp directory. Build and check with `$janissary/scripts/run.mjs check-diff`.
5. **Import and export operations.** Add `src/plugins/hosts/ssh-import.ts`. It reads the source with step 4 and parses it with step 1. It then runs one `mutateHostsFile` change that validates each alias with `validateHostFields`, skips clashes found with `sameHostName` and skips invalid aliases, and appends the rest. It returns an outcome carrying the written catalog, the imported and skipped counts, and the summary or failure text of Requirements 18 to 20 and 54. Add `src/plugins/hosts/ssh-export.ts`. It reads the catalog with `readHostsFile`, refuses when its result is not `usable` (Requirement 56) so an unreadable catalog can never empty the section, reads the target with step 4 (treating `no such file` as empty text), skips catalog hosts named by a literal alias outside the section, splices with step 2, and writes with step 4. It returns the summary or failure text of Requirements 39 to 42. Both take the root, home, resolved path, and display path as plain arguments. Tests: `ssh-import.test.ts` and `ssh-export.test.ts`, using a temp home. Build and check with `$janissary/scripts/run.mjs check-diff`.
6. **Server wiring.** In `parseCatalogCommand` (`src/plugins/hosts/catalog-commands.ts:52`), add `import` and `export` verbs taking zero or one operand. Read the operand from the raw text after the verb, so a double-quoted path keeps its spaces (Requirements 50 and 51). Add the two new usage lines and change `USAGE` (`catalog-commands.ts:6`) to `Usage: hosts [list|add|remove|import|export].`. In `runCommand` (`activate.ts:54`), refuse in a remote tab with Requirement 52's message before parsing touches any file, then dispatch the two verbs through step 4's resolver and step 5. An import maps to the existing `mutation` outcome when hosts were added, and otherwise to an `output` note or a `refusal`. An export maps to an `output` note or a `refusal`. Add `import` and `export` intents to the `defineIntents` table at `activate.ts:140`. They take an empty payload, guarded by `isRefreshIntent` as `refresh` is, run on `~/.ssh/config`, publish on a catalog change, and report through `readNotify(capabilities, true)`. Each returns `null`. Put both intent runs in a new `src/plugins/hosts/ssh-intents.ts` so `activate.ts` stays under the limit. Tests extend `activate.test.ts` and `catalog-commands.test.ts`. Build and check with `$janissary/scripts/run.mjs check-diff`.
7. **Client buttons.** In `HostList.tsx`, add two buttons after New host that fire `import` and `export` with `fireIntent`, as Refresh does at `HostList.tsx:61`. The file stays under 200 lines, about 186, so no extraction is needed. Tests: additions to `HostList.test.tsx`. Build and check with `$janissary/scripts/run.mjs check-diff`.
8. **Spec.** Update `product/specs/hosts-tab.md` with an "Importing and exporting" section and the new command verbs and usage lines. Update `product/specs/ssh-tab.md` § Saved host destinations to note that imported hosts drop other ssh settings. Build and check with `$janissary/scripts/run.mjs check-diff`.

## UI design

1. **Placement.** Two icon-only buttons, `faFileImport` and `faFileExport`, sit in the Hosts tab metadata bar after New host and before the Split control. They are titled and named `Import from ssh config` and `Export to ssh config`, and they show even when the list is empty (user answer: "Icons after New host").
2. **Interaction.** A click runs the operation at once, with no dialog or confirmation ("the import is all or none, without dialog" and "the export is all or none, without dialog"). Focus stays on the button. Ordinary button keys activate it, and a key on a focused button belongs to that button rather than the list, as the existing header buttons behave.
3. **States.** There is no busy or disabled state. The outcome arrives as one notification in the feed, attributed to the Hosts tab, and an import's new rows appear as the catalog publishes (user answer: "One summary line").
4. **Key bindings.** No new chord is added, so nothing collides with `help/keys.md` or the existing Cmd+N and Ctrl+N (user answer: "Named per row, no chord").
5. **Visual consistency.** The buttons use the existing `.host-list-header .plugin-actions button` style in `hosts.css`, with no new CSS.

## Tests

- `src/plugins/hosts/ssh-config/parse.test.ts`: literal aliases, including multi-name lines and pattern and `Match` exclusion (Requirements 3, 4). First-match effective values across `Host *`, `?`, and `!` blocks (5, 6). `Match` skipping (7). `%h` and `%%` expansion, with other tokens marked (8, 9). `Include` ignored (2). Case-folded first spelling (10).
- `src/plugins/hosts/ssh-config/section.test.ts`: complete and unmatched markers (23, 24). Rewriting the first section and removing later ones (30). Appending at the end (29). Byte-identical outside text (28). Header comment and block format (31 to 33).
- `src/atomic-write.test.ts`: a create mode applies to a new file only (35).
- `src/plugins/hosts/ssh-config-target.test.ts`: prefix expansion (47). Cwd-then-root lookup (48). The relative create location (49). Display abbreviation (55).
- `src/plugins/hosts/ssh-config-file.test.ts`: read problem words (54). New file `0600` and parent `0700` (35, 36). Write-through to a symlink target (37). Atomic replace (38).
- `src/plugins/hosts/ssh-import.test.ts`: every importable alias added in one write (11 to 14). Clashing and invalid aliases skipped with the saved host unchanged (15 to 17). Nothing written on a read or write failure (18). Summary and empty wording, singular and plural, with and without skips (19, 20).
- `src/plugins/hosts/ssh-export.test.ts`: the section mirrors the catalog (22). Clashes outside the section skipped (25). Orphans dropped and changed entries overwritten (26, 27). Path dropped (34). Missing file created (35). Summary, empty, and emptied-section cases (39 to 41). Write failure (42). Unusable catalog refused with the section untouched (56).
- `src/plugins/hosts/catalog-commands.test.ts`: `import` and `export` verbs, case-insensitive, with zero or one operand (43, 44, 46). Quoted operands with spaces, unquoted tokens, and the usage line for an unmatched quote or trailing text (50, 51). The new usage lines (53).
- `src/plugins/hosts/activate.test.ts`: the verbs note in the transcript without opening a tab, and publish to an open tab on import (45). Remote-tab refusal without touching any file (52). The `import` and `export` intents publish on change, notify on the Hosts tab, and return `null` (21, 55).
- `web/src/plugins/hosts/HostList.test.tsx`: both buttons sit before Split, appear in the empty state, and fire `import` and `export` without opening a row or a dialog (UI 1, 2).

## Out of scope

- Any dialog, preview, confirmation, or per-host selection for import or export ("all or none, without dialog").
- `Include` directives, `Match` evaluation, and the system file `/etc/ssh/ssh_config` ("No sync, export, or extras").
- Importing any ssh setting other than `HostName`, `User`, and `Port` ("HostName, user, port").
- Changing an already saved host through import ("Skip both, import rest").
- Live sync, or tracking which hosts came from an import ("No sync, export, or extras").
- Any remote file, and running either verb from a remote tab ("only work locally").
- Exporting a saved host's path, for example as `RemoteCommand` ("Drop silently").
- Any keyboard chord for Import or Export ("Named per row, no chord").

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then check against the running app:

1. Back up the real `~/.ssh/config`, then put the following in a scratch one: `Host bad` with `User a@b`, then `Host web1 web2` with `HostName %h.corp.example` and `Port 2222`, then `Host db*` with `User dba`, then `Host *` with `User ops` last, so it only fills settings the earlier blocks left unset. Save `web2` first with `hosts add web2 x`.
2. Open `hosts` and press Import. The notifications feed should read `Imported 1 host from ~/.ssh/config; skipped 2.`. `web1` should appear with user `ops` and destination `web1.corp.example:2222`, `web2` should still point at `x`, and no `db*` or `bad` row should appear. Failure looks like a changed `web2`, a pattern or invalid row, or the wrong user or port.
3. Press Export. The feed should read `Exported 1 host to ~/.ssh/config; skipped 1.`, because `web2` clashes with the alias outside the section. The file should end with the managed section holding `web1` in the Requirement 31 to 33 format, and every byte above it should be unchanged (`diff` against a copy). Delete `web1` in the Hosts tab and press Export again. The section should now be empty.
4. Run `hosts import nowhere`. The transcript should refuse with `Cannot read ssh config <path>: no such file.`. From a remote tab, run `hosts import`. It should refuse with `hosts import and hosts export work only in local tabs.`.
5. Restore the real `~/.ssh/config`.
