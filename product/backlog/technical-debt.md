# technical-debt

## ready

* Expand an `open` glob without shelling out through whatever login shell the user happens to run.

Existing Debt: The glob branch of the `open` command builds a bash-shaped `for` loop as a string and runs it through the shell named by `$SHELL`, in a codebase that otherwise spawns with argument arrays and explicitly accommodates shells that spell things differently. Severity: 5/10

Existing Risk: 4/10 - On a host whose login shell is fish, csh, or anything else without POSIX `for … do … done`, the loop is a syntax error, the empty output reads as an empty match set, and `open *.png` reports "no matching files" for a directory full of them — with the same string interpolation meaning a pattern carrying a `;` runs whatever follows it.

Proposal Risk: 2/10 - Matching is done by the process itself and behaves the same on every host, though a pattern relying on a shell extension the chosen matcher does not implement would expand differently than it does today.

Proposal: `expandGlob` in `src/open-file-manager.ts` runs `spawnSync(SHELL_NAME, ['-c', "for f in <pattern>; do printf '%s\\n' \"$f\"; done"])` with the user's pattern interpolated raw, where `SHELL_NAME` comes from `src/shell-manager.ts` and is `(process.env.SHELL || 'bash').split('/').pop()` — a constant that exists to label the `shell:<name>` connection row and to launch tab shells, now carrying a second, incompatible meaning as a glob interpreter. `shellStartupArgs` in `src/shell-startup.ts` shows the standard this file is held to: it keeps a per-shell table and documents what an unrecognized shell gets, precisely because shells disagree. Replace the shell-out with in-process matching — Node's own `fs.glob`, or a small matcher over `readDirSorted` from `src/file-navigator/index.ts` — keeping the observable contract `runOpenCommand` in `src/open-file-command.ts` depends on: absolute paths resolved against the tab's cwd, non-files dropped, duplicates removed, `localeCompare` ordering, and the `TabManager.OPEN_MAX_FILES` cap with its "Opening the first N of M" note applied by the caller as it is now. Match the current `isGlobPattern` character set in `src/commands/open.ts` (`*`, `?`, `[]`, `{}`) so a pattern that expands today still expands, and keep brace expansion working or say plainly in the command's error text that it no longer does. `src/commands/open.test.ts` covers `parseOpen` and `isGlobPattern` but nothing exercises `expandGlob` itself, and `src/open-file-manager.test.ts` reaches the open pipeline with `expandGlob` supplied as a callback; add direct tests over a temporary directory for each pattern form, for a pattern matching only directories, for the over-cap case, and for a pattern containing a shell metacharacter, which must now match nothing rather than execute.

## development

## deferred

## declined

* Protect user edits made after a copy-paste before undo deletes its destination in `src/file-navigator/moves.ts`: `undoCopyPaste` records only absolute source and destination paths and unconditionally removes each destination, so editing or replacing a copied file before pressing undo silently deletes the newer content. Record enough identity or content metadata with each copy history entry to detect divergence and surface a conflict instead of removing a changed destination. Severity: **high**. — deferred: complexity 8/10, requires recursive destination identity tracking plus new undo conflict semantics across server history and client conflict handling.

* Stop the sandbox-confinement tests from passing vacuously off darwin in `src/sandbox/index.test.ts`: seventeen cases open with a bare `if (!sandboxAvailable()) return;`, and `sandboxAvailable()` requires `process.platform === 'darwin'` plus `/usr/bin/sandbox-exec`, so on the `ubuntu-latest` runners every job in `.github/workflows/ci.yml` uses, all of them return before their first assertion and are reported as *passing* rather than skipped. Every assertion about the Seatbelt profile the security model rests on — the `-D` param bindings, the secret-deny paths, the credential scrub, the `TMPDIR` override, the offline variant — therefore only ever runs on a developer's Mac, and CI would stay green if the confined path were deleted outright. Convert them to `describe.skipIf(!sandboxAvailable())` (or `it.skipIf`) so a run that cannot exercise confinement reports skips instead of green passes. Severity: **high**. declined: this application is currently limited to running on mac os x.
