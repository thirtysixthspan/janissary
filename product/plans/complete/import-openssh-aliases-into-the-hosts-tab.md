# Import and export OpenSSH aliases in the Hosts tab

**Complexity: 7/10** — ~650 added lines, 55 requirements, 45 test scenarios across 5 edited files and 7 new modules (p=8.09)

## Goal

Let a user move named hosts between their local OpenSSH configuration and Janissary's saved-hosts catalog in one step, without retyping them. The feature text asks for importing "concrete aliases and their supported hostname, user, and port settings". Planning added the other direction, "export back out is in scope". It then cut the scope down three times: "import and export should only work locally", "the import is all or none, without dialog", and "the export is all or none, without dialog". Today the Hosts tab accepts hosts one at a time, through the New host form or `hosts add` (`product/specs/hosts-tab.md`), and nothing writes ssh config. After this change, one Import action adds every importable alias. One Export action rewrites a Janissary-managed section of the ssh config to mirror the saved catalog. Anything that can't be carried over is skipped and counted in the summary line.

## Requirements

Reading ssh config:

1. The Import and Export buttons use `~/.ssh/config` only ("~/.ssh/config only").
2. `Include` directives are ignored ("~/.ssh/config only", option 2: "Include lines are ignored").
3. Each name on a `Host` line that has no `*` or `?` and does not start with `!` is a literal alias, including a name with brackets or a backslash ("Literal names only").
4. Pattern names and `Match` blocks are never aliases; an empty name is never literal ("Literal names only").
5. An alias's `HostName`, `User`, and `Port` are its effective values within the file: every `Host` block whose patterns match the alias applies in file order, including `*`, `?`, and `!` negation ("Effective, like ssh"). A block applies when a non-negated pattern matches and no negated pattern matches; a block made only of negated patterns applies to nothing.
6. For each of those three settings, the first value obtained wins ("Effective, like ssh").
7. Settings inside a `Match` block never contribute; everything from a `Match` line up to the next `Host` line is skipped ("Ignore Match blocks").
8. In an effective `HostName`, `%h` expands to the alias name and `%%` to a literal `%` ("Expand %h and %%").
9. Any other `%` token makes the alias invalid, and any `%` token in an effective `User` or `Port` makes it invalid ("Expand %h and %%").
10. Aliases are folded by name ignoring case, keeping the spelling of the first appearance ("One row, first spelling").
11. A keyword matches regardless of case, a keyword and its arguments are separated by `=` or whitespace, an argument may be double-quoted with no escapes, `#` outside quotes starts a comment, and each physical line is scanned on its own (Implementation step 1).
12. One `Host` block is produced per `Host` line in file order, carrying every name on that line; a `Match` line produces a block marked so its settings are skipped (Implementation step 1).

Import:

13. Import adds every literal alias as a saved host in one write, with no dialog and no per-alias choice ("the import is all or none, without dialog").
14. An imported host's destination is the alias's effective `HostName`, or the alias name when none applies ("HostName, user, port").
15. An imported host's user and port are the alias's effective `User` and `Port` ("HostName, user, port").
16. No other ssh setting is imported or stored ("HostName, user, port").
17. An alias whose name matches a saved host ignoring case is skipped, and the saved host is left unchanged ("Skip both, import rest").
18. An alias whose name, user, host, or port fails the saved-host rules, or whose reader record carries a non-empty `invalidToken`, is skipped ("Skip both, import rest").
19. Import never modifies or removes an existing saved host ("All existing Hosts tab").
20. A read failure or a catalog write failure writes nothing ("Skip both, import rest": "Only a read or write failure writes nothing").
21. A successful import reports `Imported 3 hosts from <path>; skipped 2.`, with `host` for one, and the `; skipped N` part only when something was skipped ("One summary line").
22. When no alias is importable, nothing is written and the report is `No aliases to import from <path>.`, followed by `; skipped N` before the period when something was skipped ("Cannot read / Nothing to" and "One summary line").
23. The Hosts tab's rows update from the written catalog, as after `hosts add` (`product/specs/hosts-tab.md` § Editing hosts).

Export:

24. Export rewrites the managed section to hold every saved host, with no dialog and no per-host choice ("the export is all or none, without dialog").
25. The managed section is the text from a `# BEGIN janissary hosts` line through the next `# END janissary hosts` line ("Managed section").
26. An unmatched BEGIN or END line is ordinary text ("Treat as no section").
27. A saved host whose name matches, ignoring case, a literal `Host` alias outside the managed section is skipped ("Skip clashes, mirror catalog").
28. Section entries whose names are no longer saved are dropped ("Skip clashes, mirror catalog").
29. Section entries whose values differ from the catalog are overwritten with the catalog values ("Skip clashes, mirror catalog").
30. Export leaves every byte outside the managed section untouched, including CRLF endings and a missing trailing newline ("Managed section").
31. When the file has no complete section, Export appends one after the file's last line ("End of the file").
32. When the file has two or more complete sections, Export rewrites the first and removes the later ones ("Merge into one").
33. The line after `# BEGIN janissary hosts` reads `# Managed by Janissary; edits inside this section are replaced on export.` ("Plus a header comment").
34. Each exported host is written as `Host <name>`, then `    HostName <host>`, then `    User <user>` and `    Port <port>` only when saved, with a four-space indent ("Plus a header comment").
35. Exported hosts are separated by one blank line and written in name order ignoring case ("Plus a header comment").
36. A saved host's path is not exported ("Drop silently").
37. A missing target file is created with mode `0600` ("Create it").
38. A missing parent directory is created with mode `0700` ("Create it").
39. A target that is a symlink is written through to the file it points at, so the link survives ("Resolve link, then atomic").
40. The target is replaced atomically ("Resolve link, then atomic").
41. A successful export reports `Exported 5 hosts to <path>; skipped 1.`, with `host` for one, and the `; skipped N` part only when something was skipped ("One summary line").
42. When there are no saved hosts and the file has no complete section, nothing is written and the report is `No hosts to export.` ("Notification, no dialog").
43. When there are no saved hosts but a section exists, Export empties it, since the section mirrors the catalog ("Skip clashes, mirror catalog"). When every saved host is skipped as a clash and a section exists, the report is `No hosts to export; skipped N.`
44. A failed write reports `Could not write ssh config <path>: <problem>.` ("Could not write …").

Commands and paths:

45. `hosts import [file]` runs the import against `~/.ssh/config`, or against `[file]` when given ("`hosts import <file>` command to allow for other files").
46. `hosts export [file]` runs the export against `~/.ssh/config`, or against `[file]` when given ("Button + `hosts export`").
47. Neither verb opens or focuses the Hosts tab. Like `hosts add`, each refreshes an open Hosts tab and answers in the transcript it was typed in (`product/specs/hosts-tab.md` § Commands; the dialog the verbs used to open is gone).
48. Both verbs match regardless of case (`product/specs/hosts-tab.md` § Commands: "Every verb matches regardless of case").
49. A file operand of `~`, or one starting with `~/` or `$HOME/`, resolves to the home directory or a path under it. One starting with `$root` resolves against the project root, and one starting with `$workspace` against `$root/.janissary/workspace` ("~, $root, $HOME, $workspace"). An absolute operand is used as it stands. Prefixes match at a token boundary, so `$rootnote` and `$workspace-2` are relative operands.
50. A relative operand is tried first against the working directory of the tab the command was typed in, then against the project root, and the first existing file wins ("cwd, then project").
51. A relative export operand that exists in neither place is created in the typing tab's working directory ("Create it").
52. The file operand may be wrapped in double quotes, and the text between them, which may contain spaces, is the path. Inside quotes there are no escapes. An unquoted operand is one whitespace-free token ("Quoted paths").
53. An unmatched double quote, or any text after the operand, gives the verb's usage line ("Quoted paths").
54. Typed in a remote tab, both verbs refuse with `hosts import and hosts export work only in local tabs.` before reading or writing anything ("Refuse in remote tabs").
55. The bare usage line becomes `Usage: hosts [list|add|remove|import|export].`. A malformed import gives `Usage: hosts import [file]` and a malformed export gives `Usage: hosts export [file]` ("Extend + own lines").
56. A missing or unreadable file to import is reported as `Cannot read ssh config <path>: <problem>.`, with `<problem>` such as `no such file`, `is a directory`, `permission denied`, `file is too large`, or `could not be read`. A missing export target is not an error: Requirement 37 applies ("Cannot read / Nothing to" and "Create it").
57. A button-started report is a notification attributed to the Hosts tab. A command-started success is a transcript note, and a command-started failure is a refusal in that transcript. `<path>` is always shown abbreviated, with the home directory as `~`, the project root and its `.janissary` directory as `$root`, and a workspace path under `$root/workspace` ("No dialog, notification" and "One summary line").

Added in the final question phase:

58. When the saved-hosts file in effect is unusable, Export writes nothing and reports `Cannot export hosts: <path> is unusable — fix it by hand.`, where `<path>` is that hosts file. The usual `Hosts file <path> is unusable: <problem>.` notice still appears (final-phase answer: "Refuse, mirror wording").

Added during review:

59. Literal `Host` names containing brackets or a backslash are escaped before `Minimatch` is constructed, so a bracketed IPv6-style alias or a backslash-bearing alias receives the `HostName`, `User`, and `Port` from its own block. The leading `!` is stripped first and `*` and `?` keep their wildcard meaning; the fixed `nocase`, `dot`, `nobrace`, `noext`, and `nonegate` options are unchanged.
60. A `Host` pattern longer than 1024 characters, or with more than three separate `*` runs, is refused before a `Minimatch` is built: it supplies no settings and cannot throw out of `readEffectiveAliases`. `**` counts as one run and `?` is uncapped. A refused negated name makes its whole block non-matching, so a pathological name cannot make a block apply to aliases it was meant to exclude.
61. Export refuses a target whose read fails for any reason other than `no such file`: it reports `Cannot read ssh config <path>: <problem>.` with the display path and exact problem word and leaves the target byte for byte intact. A genuinely missing target is still created. The check sits immediately after the target read, before any parsing or write, and mirrors import's read guard.
62. Neither catalog that can supply saved hosts — `<root>/.janissary/hosts.json` or `~/.janissary/hosts.json` — can be the operand of either verb. The shared runner refuses before any read or write with `Cannot export hosts: <path> is the hosts catalog and cannot be an export target.` or `Cannot import hosts: <path> is the hosts catalog and cannot be an import source.` Both catalogs and any ordinary config are left untouched. Existing paths are resolved through `realpathSync` with a `path.resolve` fallback, so a symlink or a `..` spelling cannot slip past, and a not-yet-created catalog target is still refused. The guard has exactly one owner, in the runner.
63. Both catalog locations are built by one exported `catalogPaths(root, home)` helper in `src/plugins/hosts/hosts-file.ts` from `FILE_NAME`, omitting the project path when the root is empty. `readHostsFile` and the runner's catalog guard both take their paths from it, and drift tests compare the helper's paths with the path `readHostsFile` reports for project-only and home-only fixtures.
64. The literal-name predicate `isLiteralName` is exported from `src/plugins/hosts/ssh-config/parse.ts` and reused by `outsideLiteralAliases` in `section.ts`, so a name that receives settings and a name reported outside the managed section are classified by one definition. The case-insensitive first-spelling handling stays unchanged and a cross-module test asserts both paths agree.

## Design decisions

- Import and export are single actions with no dialog, no preview, and no per-row choice (user answers: "the import is all or none, without dialog" and "the export is all or none, without dialog"). This supersedes every earlier dialog decision: checkboxes, row statuses, defaults, primary-button rules, focus, re-entry, and stale-preview handling.
- Import skips any alias that clashes with a saved name, fails the host rules, or carries an unexpandable `%` token, and imports the rest in one catalog write (user answer: "Skip both, import rest"). The skip test uses `sameHostName` and `validateHostFields` inside one `mutateHostsFile` change function, so the clash check runs against the catalog as it is at write time (Assumptions 1 to 3).
- Export makes the managed section mirror the catalog, minus hosts whose names are literal aliases elsewhere in the file (user answer: "Skip clashes, mirror catalog").
- Imported hosts take the alias's `HostName`, `User`, and `Port`. The catalog has no field for any other ssh setting, so settings attached to the alias name, such as `IdentityFile` or `ProxyJump`, are not saved with the host. This describes what is stored, not what happens at launch: `buildSavedSshInvocation` in `src/ssh-saved-host.ts` emits `ssh`, an optional `-p` for the port and `-t` for the path, `--`, and the real `[user@]host`, with no `-F` or other config override, and `parseSshCommand` in `src/ssh.ts` spawns that text verbatim. The real ssh binary therefore still reads the user's ssh config at launch, so a `Host *` or destination-matching block can still supply settings for the real destination (user answer: "HostName, user, port"; Assumption 4).
- A new section is appended at the end of the file. A `Host *` block earlier in the file can therefore still supply values first (user answer: "End of the file").
- Import and export work only on local files, and a remote tab refuses both verbs before any path resolution or file I/O (user answers: "only work locally" and "Refuse in remote tabs"; Assumption 6).
- The ssh config logic lives in a new namespace directory, `src/plugins/hosts/ssh-config/` (user answer: "1 but new namespace src/plugins/hosts/ssh-config"). Its modules import nothing through `../`, because the plugin import boundary refuses any `../` path not on its allowlist (Assumption 5). Conversion into saved hosts happens in the parent hosts modules, which can reach `hosts-values.ts`. The import and export operations live there as `import-ssh.ts` and `export-ssh.ts`, and the managed-section module reuses `isLiteralName` from `parse.ts` rather than keeping a second copy of the literal-name rule.
- The buttons fire two new intents, `import` and `export`, each with an empty payload guarded by `isRefreshIntent`. Each runs the whole operation through the shared `runSshIntent` runner, publishes the catalog through the existing `publish` when the catalog changed, reports through `readNotify(capabilities, true)`, and returns `null`, like `deleteRow` at `activate.ts:103`. The payload shape and its schema version are unchanged.
- The verbs follow the `hosts add` path in `runCommand`. A successful import is a `mutation`-style outcome, which publishes and then notes the summary, and a failure is a `refusal` (Existing functionality 3). `runCommand` parses first and hands the two parsed variants to the shared runner, so a well-formed command executes instead of returning the parse-layer usage-line checkpoint.
- One runner in `src/plugins/hosts/ssh-intents.ts` owns operand resolution, the remote-tab and catalog-path refusals, the operations, publishing on import change, and note-versus-refusal reporting. `activate.ts` injects `publish` and `readNotify` as callbacks, because importing them back would close an `import-x/no-cycle` loop. The runner forwards its notify callback to `exportSshHosts` for the unusable-catalog notice.
- Reads are bounded at 1 MiB, reported as `file is too large` beyond that. The ceiling is far above any real ssh config and can rise without other changes. Export refuses any other read problem, treating only `no such file` as a new file.
- Pattern matching uses `Minimatch` with `nocase`, `dot`, `nobrace`, `noext`, and `nonegate`. Brackets and backslashes in a literal name are escaped so the alias matches its own block, while `*` and `?` stay wildcards; the leading `!` is stripped by hand before both the complexity guard and the matcher see the pattern. This is a deliberate shortcut: minimatch is used as the matcher rather than a literal-only `*`/`?` implementation, with escaping for the characters ssh treats literally. A pattern over 1024 characters or with more than three `*` runs is refused before compilation and makes its whole block non-matching, rather than throwing.
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
10. A usable project catalog replaces the home catalog entirely, including `{}`, and a missing or unusable project file falls back to the home file. Moving path construction into `catalogPaths` must not change that selection, its problems, or its reported path. Pinned by `src/plugins/hosts/hosts-file.test.ts` › `selecting the effective hosts file`.
11. An over-long or star-heavy `Host` pattern is refused before a `Minimatch` is built, contributes no settings, and cannot throw; escaping brackets or backslashes must not make such a pattern acceptable. Pinned by `src/plugins/hosts/ssh-config/parse.test.ts` › `readEffectiveAliases`.
12. A leading `!` is stripped by hand and a negated name still excludes an alias from its block, including for a bracketed name. Pinned by `src/plugins/hosts/ssh-config/parse.test.ts` › `readEffectiveAliases > applies matching blocks in file order with first values winning`.
13. `tokenizeSshConfig` keeps returning the same ordered block list, including repeated names and a trailing backslash, unchanged. Pinned by `src/plugins/hosts/ssh-config/parse.test.ts` › `tokenizeSshConfig`.

## Assumptions

1. Every surface validates hosts with one function: `src/plugins/hosts/hosts-values.ts:60` `export function validateHostFields(`.
2. Catalog writes read and rewrite the file in effect in one pass: `src/plugins/hosts/hosts-file.ts:155` `export function mutateHostsFile<T>(`.
3. Host names compare without regard to case: `src/plugins/hosts/hosts-values.ts:90` `export function sameHostName(`.
4. A saved host launches with its port and `user@host` only, and no other ssh option: `src/ssh-saved-host.ts:38` `export function buildSavedSshInvocation(host: SavedHost): SshParsed {`. `parseSshCommand` in `src/ssh.ts` spawns the generated text verbatim.
5. A concrete server plugin may import nothing through `../` except the allowlisted host modules: `eslint.plugin-boundaries.mjs:38` `` regex: String.raw`^\.\./(?!(?:api\.js|files\.js| ``.
6. A plugin learns the typing tab's working directory, project root, and whether it is remote from `originTab()`: `src/plugins/api-origin-tab.ts:22` `export type TabPluginOriginTab = {`, whose `remote?: true;` field marks a remote tab.
7. The host's atomic write is temp-file-and-rename, keeping only an existing file's mode: `src/atomic-write.ts:9` `export function atomicWriteFile(`.
8. A concrete plugin cannot import helpers back from `activate.ts`: `eslint.config.mjs` `'import-x/no-cycle': 'error',` and `activate.ts` imports the runner, so the caller injects `publish` and `readNotify` as callbacks.
9. The catalog filename is owned by `FILE_NAME` in `src/plugins/hosts/hosts-file.ts`, and `catalogPaths(root, home)` is its one construction site for both catalog locations.

## Existing functionality

1. The Hosts tab declares its intents in one table: `src/plugins/hosts/activate.ts:165` `intent: defineIntents('hosts', isHostsPayload, {`.
2. The `hosts` command parses verbs purely before any I/O: `src/plugins/hosts/catalog-commands.ts:68` `export function parseCatalogCommand(argument: string): CatalogParse {`.
3. A catalog-changing command publishes and then notes its text: `src/plugins/hosts/catalog-commands.ts:21` `| { kind: 'mutation'; text: string; hosts: SavedHost[]; path: string };`.
4. Catalog publishes go through one helper: `src/plugins/hosts/activate.ts:39` `function publish(capabilities: TabPluginServerCapabilities, payload: HostsPayload): void {`.
5. Hosts-tab notifications are attributed by one helper: `src/plugins/hosts/activate.ts:49` `function readNotify(capabilities: TabPluginServerCapabilities, owned: boolean): (message: string) => void {`.
6. An intent that reports by notification and returns `null` already exists: `src/plugins/hosts/activate.ts:103` `function deleteRow(`.
7. Formatting a saved destination as `host[:port]` already exists: `src/plugins/hosts/hosts-values.ts:86` `export function formatDestination(host: SavedHost): string {`.
8. Plugins replace files atomically through the allowlisted host module: `src/plugins/files.ts:92` `export function replaceFileAtomically(filePath: string, content: Uint8Array): void {`.
9. Glob matching with configurable options is an installed dependency already in use: `src/file-glob/match.ts:1` `import { Minimatch } from 'minimatch';`.
10. Symlink-preserving atomic replacement is already done for workspace writes: `src/file-navigator/filesystem-port.ts:212` `let target = path.join(realpathSync(path.dirname(absolute)), path.basename(absolute));`.
11. The `~` and `$root` prefix expansion exists in core, though the plugin boundary keeps it out of reach: `src/paths.ts:15` `export function expandUserPath(input: string, context: RootContext): string {`.
12. Fire-and-forget intents from the metadata bar already exist: `web/src/plugins/hosts/HostList.tsx:61` `const refresh = () => { fireIntent({ intent }, 'refresh', {}); };`.
13. The metadata bar's icon buttons sit before the Split control: `web/src/plugins/hosts/HostList.tsx:122` `<button type="button" title="New host" aria-label="New host" onClick={() => setEditing('new')}>`.
14. The file-glob guard already caps pattern length and star runs before compilation: `src/file-glob/pattern-limits.ts`, mirrored locally for `Host` patterns because the plugin boundary cannot import file-glob.
15. The refusal-aware reporting already exists in the runner: `src/plugins/hosts/ssh-intents.ts:50` `function report(`, which rejects a transcript command and notifies an intent.

## Implementation steps

Each step ends green under `$janissary/scripts/run.mjs check-diff`.

1. **Pure ssh config reader.** Add `src/plugins/hosts/ssh-config/parse.ts`. It tokenizes config text into ordered `Host` and `Match` blocks, following ssh's keyword rules: case-insensitive keywords, `=` or whitespace separators, quoted arguments with no escapes, and `#` comments. One `Host` line produces one block carrying every name; `Include` and unknown keywords are consumed as one line and never activate following lines. It lists literal aliases in first-appearance order, folded by case, and computes each alias's effective `HostName`, `User`, and `Port` with first-match semantics, manual `!` negation, `*`/`?` wildcards, `Match` skipping, and `%h`/`%%` expansion only in `HostName`. Match each pattern with `Minimatch` from the already-installed `minimatch` dependency, with `nocase`, `dot`, `nobrace`, `noext`, and `nonegate`. Escape `\`, `[`, and `]` in the pattern passed to `Minimatch` so a literal name containing them matches its own block, while `*` and `?` stay wildcards. Add `src/plugins/hosts/ssh-config/pattern-limits.ts` with the 1024-character and three-`*`-run caps (`**` counts once, `?` uncapped); a refused post-`!` pattern leaves its matcher absent and its whole block non-matching rather than throwing. Export `isLiteralName` so the managed-section module can reuse it. The reader returns raw strings plus a marker for an unexpandable token. It imports nothing through `../`. Colocated tests: `parse.test.ts`. Build and check with `$janissary/scripts/run.mjs check-diff`.
2. **Pure managed-section splice.** Add `src/plugins/hosts/ssh-config/section.ts`. It finds complete BEGIN/END pairs and lists literal aliases outside all sections, reusing `tokenizeSshConfig` and `isLiteralName` from `./parse.js`. It serializes a section from host entries in the format of Requirements 33 to 35. It splices that section into file text in one of three ways: rewrite the first complete section, remove later ones, or append at the end when there is none. Bytes outside sections stay identical, including CRLF and a missing trailing newline. It imports nothing through `../`. Colocated test: `section.test.ts`. Build and check with `$janissary/scripts/run.mjs check-diff`.
3. **Create mode for atomic writes.** Give `atomicWriteFile` in `src/atomic-write.ts` an optional `createMode`, applied only when the target does not exist. An existing file keeps its own mode as today. Pass it through an optional third parameter of `replaceFileAtomically` in `src/plugins/files.ts`. Every existing caller passes nothing and is unchanged. Test: a create-mode case in `src/atomic-write.test.ts`. Build and check with `$janissary/scripts/run.mjs check-diff`.
4. **Path resolution and file access.** Add `src/plugins/hosts/ssh-config-target.ts`. It holds a pure resolver that expands the Requirement 49 prefixes, tries the bases of Requirement 50, and produces a local absolute path plus its abbreviated display form, folding the `.janissary` state directory and the home directory as in Requirement 57. The plugin cannot import `src/paths.ts` (Assumption 5), so it re-implements the small prefix expansion of `expandUserPath` (`src/paths.ts:15`) and the display abbreviation. Those few lines are a deliberate duplicate. A third plugin needing them is the signal to add `src/paths.ts` to the boundary allowlist instead. Add `src/plugins/hosts/ssh-config-file.ts` for effects. A read is bounded at 1 MiB and maps `ENOENT`, `EISDIR`, `EACCES`, and oversize to `no such file`, `is a directory`, `permission denied`, and `file is too large`; any other error maps to `could not be read`. A write creates a missing parent with `mkdirSync` (recursive, mode `0700`), resolves an existing symlinked target the way `LocalFileSystemPort.writeFile` does at `src/file-navigator/filesystem-port.ts:212`, and writes through `replaceFileAtomically` with create mode `0600`. Tests sit beside each file, using a temp directory. Build and check with `$janissary/scripts/run.mjs check-diff`.
5. **Import and export operations.** Add `src/plugins/hosts/import-ssh.ts`. It reads the source with step 4 and parses it with step 1. It then runs one `mutateHostsFile` change that skips records with a non-empty `invalidToken`, validates each alias with `validateHostFields`, skips clashes found with `sameHostName`, and appends the rest. It returns an outcome carrying the written catalog, the imported and skipped counts, and the summary or failure text of Requirements 20 to 22 and 56. Add `src/plugins/hosts/export-ssh.ts`. It reads the catalog with `readHostsFile`, forwarding the caller's notify, and refuses when its result is not `usable` (Requirement 58) so an unreadable catalog can never empty the section. It reads the target with step 4, refusing any read problem other than `no such file` with import's read-guard wording (Requirement 61), skips catalog hosts named by a literal alias outside the section, splices with step 2, and writes with step 4. It returns the summary or failure text of Requirements 41 to 44. Both take the root, home, resolved path, and display path as plain arguments. Tests: `import-ssh.test.ts` and `export-ssh.test.ts`, using a temp home. Build and check with `$janissary/scripts/run.mjs check-diff`.
6. **Server wiring.** In `parseCatalogCommand` (`src/plugins/hosts/catalog-commands.ts:68`), add `import` and `export` verbs taking zero or one operand. Read the operand from the raw text after the verb, so a double-quoted path keeps its spaces (Requirements 52 and 53). Add the two new usage lines and change `USAGE` (`catalog-commands.ts:6`) to `Usage: hosts [list|add|remove|import|export].`. In `runCommand` (`activate.ts:55`), parse before `runCatalogCommand`; refuse in a remote tab through the shared runner before parsing touches any file, then dispatch the two verbs through the resolver and step 5. An import that added hosts publishes and notes its summary; a successful import that added nothing notes its empty report; any failure is a refusal. In `src/plugins/hosts/ssh-intents.ts`, one `runSshIntent` owns the remote refusal, operand resolution, the catalog-path guard of Requirement 62, the operations, publishing on import change, and note-versus-refusal reporting. Build the two forbidden catalog paths through `catalogPaths` (`src/plugins/hosts/hosts-file.ts`) so the guard and `readHostsFile` cannot drift (Requirement 63). Add `import` and `export` intents to the `defineIntents` table at `activate.ts:165`, guarded by `isRefreshIntent`, taking an empty payload and returning `null`. Tests extend `activate.test.ts` and `catalog-commands.test.ts`. Build and check with `$janissary/scripts/run.mjs check-diff`.
7. **Client buttons.** In `HostList.tsx`, add two buttons after New host that fire `import` and `export` with `fireIntent` and an empty payload, as Refresh does at `HostList.tsx:61`. The file stays under 200 lines, about 182, so no extraction is needed. Tests: additions to `HostList.test.tsx`. Build and check with `$janissary/scripts/run.mjs check-diff`.
8. **Specs.** Update `product/specs/hosts-tab.md` with an "Importing and exporting" section, the "Exporting to an ssh config" and "Catalog files are not ssh configs" sections, the buttons in the metadata-bar paragraph, and the new command verbs and usage lines. Update `product/specs/ssh-tab.md` § Saved host destinations to separate what the catalog stores from what the real ssh binary reads at launch, with the alias-versus-destination example. Add `product/specs/ssh-config-host-patterns.md` for literal metacharacters, the shared literal-name rule, and the complexity limits. Build and check with `$janissary/scripts/run.mjs check-diff`.

## UI design

1. **Placement.** Two icon-only buttons, `faFileImport` and `faFileExport`, sit in the Hosts tab metadata bar after New host and before the Split control. They are titled and named `Import from ssh config` and `Export to ssh config`, and they show even when the list is empty (user answer: "Icons after New host").
2. **Interaction.** A click runs the operation at once, with no dialog or confirmation ("the import is all or none, without dialog" and "the export is all or none, without dialog"). Focus stays on the button. Ordinary button keys activate it, and a key on a focused button belongs to that button rather than the list, as the existing header buttons behave.
3. **States.** There is no busy or disabled state. The outcome arrives as one notification in the feed, attributed to the Hosts tab, and an import's new rows appear as the catalog publishes (user answer: "One summary line").
4. **Key bindings.** No new chord is added, so nothing collides with `help/keys.md` or the existing Cmd+N and Ctrl+N (user answer: "Named per row, no chord").
5. **Visual consistency.** The buttons use the existing `.host-list-header .plugin-actions button` style in `hosts.css`, with no new CSS.

## Tests

- `src/plugins/hosts/ssh-config/parse.test.ts`: tokenizer cases for `Include`, keyword case, `=` and whitespace separators, quoted arguments, `#` comments, multi-name and empty `Host`/`Match` lines, and no `../` imports (Requirements 2, 11, 12). Literal aliases, including bracketed and backslash-bearing names, with pattern and `Match` exclusion (3, 4, 59). First-match effective values across `Host *`, `?`, and `!` blocks (5, 6). `Match` skipping (7). `%h` and `%%` expansion, with other tokens marked (8, 9). Case-folded first spelling (10). Over-long, star-heavy, and negated-refused patterns leave blocks non-matching without throwing (60). Ordinary `*` and `?` patterns still match.
- `src/plugins/hosts/ssh-config/section.test.ts`: complete and unmatched markers (25, 26). Rewriting the first section and removing later ones (32). Appending at the end, including CRLF and a missing trailing newline (30, 31). Byte-identical outside text (30). Header comment and block format (33 to 35). Outside aliases, including a partial section and a case-variant first spelling. Cross-module agreement with `readEffectiveAliases` through the shared `isLiteralName` (64).
- `src/atomic-write.test.ts`: a create mode applies to a new file only (37).
- `src/plugins/hosts/ssh-config-target.test.ts`: prefix expansion and token boundaries (49). Cwd-then-root lookup and the relative create location (50, 51). Absolute operands and display abbreviation, including `$root/workspace` (57).
- `src/plugins/hosts/ssh-config-file.test.ts`: read problem words, including `could not be read` (56). New file `0600` and parent `0700` (37, 38). Write-through to a symlink target (39). Atomic replace (40).
- `src/plugins/hosts/import-ssh.test.ts`: every importable alias added in one write (13 to 16). Clashing, invalid, and invalid-token aliases skipped with the saved host unchanged (17 to 19). Nothing written on a read or write failure (20, 56). Summary and empty wording, singular and plural, with and without skips (21, 22).
- `src/plugins/hosts/export-ssh.test.ts`: the section mirrors the catalog (24). Clashes outside the section skipped (27). Orphans dropped and changed entries overwritten (28, 29). Path dropped (36). Missing file created (37). Summary, empty, and emptied-section cases, including `No hosts to export; skipped N.` (41 to 43). Write failure (44). Unusable catalog refused with the section untouched (58). Oversized or unreadable target refused with the exact read wording and bytes unchanged (61).
- `src/plugins/hosts/hosts-file.test.ts`: project-only and home-only drift cases showing `readHostsFile` reports the path from `catalogPaths` (63), and an empty root yields no project path.
- `src/plugins/hosts/catalog-commands.test.ts`: `import` and `export` verbs, case-insensitive, with zero or one operand (45, 46, 48). Quoted operands with spaces, unquoted tokens, and the usage line for an unmatched quote or trailing text (52, 53). The new usage lines (55).
- `src/plugins/hosts/activate.test.ts`: the verbs note in the transcript without opening a tab, and publish to an open tab on import (47). Remote-tab refusal without touching any file (54). The `import` and `export` intents publish on change, notify on the Hosts tab, and return `null` (23, 57). Catalog operands refused for both verbs, including `..` and symlink spellings, with both catalogs unchanged and no write or tab update (62).
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
- Suppressing the user's ssh config at launch. The catalog stores only the three fields; the real ssh binary still reads its config when a saved host is launched.
- A guard inside `exportSshHosts`, `importSshHosts`, or `ssh-config-file.ts` for catalog operands; the runner owns that rule once.
- A literal-only `*` / `?` matcher replacing `Minimatch`; the existing matcher is kept behind the same call, with escaping for literal metacharacters.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then check against the running app:

1. Back up the real `~/.ssh/config`, then put the following in a scratch one: `Host bad` with `User a@b`, then `Host web1 web2` with `HostName %h.corp.example` and `Port 2222`, then `Host db*` with `User dba`, then `Host *` with `User ops` last, so it only fills settings the earlier blocks left unset. Save `web2` first with `hosts add web2 x`.
2. Open `hosts` and press Import. The notifications feed should read `Imported 1 host from ~/.ssh/config; skipped 2.`. `web1` should appear with user `ops` and destination `web1.corp.example:2222`, `web2` should still point at `x`, and no `db*` or `bad` row should appear. Failure looks like a changed `web2`, a pattern or invalid row, or the wrong user or port.
3. Press Export. The feed should read `No hosts to export; skipped 2.`, because `web1` and `web2` are both literal aliases outside the section, so the clash rule skips both saved hosts. The file should end with a header-only managed section: the `# BEGIN janissary hosts` line, the `# Managed by Janissary; edits inside this section are replaced on export.` comment, and the `# END janissary hosts` line, with no host entries. Every byte above the section should be unchanged (`diff` against a copy). Delete `web1` in the Hosts tab and press Export again. The feed should read `No hosts to export; skipped 1.`, because the remaining `web2` still clashes, and the section should stay header-only.
4. Run `hosts import nowhere`. The transcript should refuse with `Cannot read ssh config <path>: no such file.`. From a remote tab, run `hosts import`. It should refuse with `hosts import and hosts export work only in local tabs.`.
5. Run `hosts export ~/.janissary/hosts.json`. The transcript should refuse with `Cannot export hosts: ~/.janissary/hosts.json is the hosts catalog and cannot be an export target.`, and neither catalog should change. Put an oversized config at the export target and run `hosts export` again; it should refuse with `Cannot read ssh config <path>: file is too large.` and leave the file byte for byte intact.
6. Add a bracketed alias such as `Host [::1]` with its own `HostName`, `User` and `Port`, and an over-long `Host` name, then Import. The reader resolves the bracketed alias's own `HostName`, `User` and `Port`, but Import skips it because its name and destination fail the saved-host rules, so the skipped count rises and no row is written for it; the over-long name should contribute nothing and not stop the other aliases.
7. Restore the real `~/.ssh/config`.
