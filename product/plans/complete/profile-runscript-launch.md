# Launch a profile's runscript instead of its tabs

**Complexity: 3/10** — one resolution helper in `src/profiles.ts`, one small launch module beside the profile manager, and one branch in `ProfileManager.run`. The runscript reader and the system-shell queue step already exist; this change shares them instead of copying them. The rest is the listing filter, tests, one spec, one help page, and one user-documentation paragraph.

## Goal

When `profile launch <name>` finds a runscript named `<name>.rs` in a profile directory, it runs that runscript instead of opening the profile's tabs. It does this even when `<name>.json` sits beside it. A runscript-only profile (a `.rs` file with no `.json`) is a profile too: it launches, and `profile list` and the bare `profile launch` picker list it.

## Approach

A runscript is a `.rs` file holding one command per line. `parseRunscriptText` in `src/schedule/system/runscript.ts` drops blank lines and `#` comments. `execute <name>` reads `.janissary/scripts/<name>.rs` with `readRunscript` (`src/schedule/system/runscript-files.ts`), which refuses a symlinked or non-regular file. `runRunscriptNow` (`src/commands/execute.ts`) then ensures the managed system shell and queues the lines to it with `enqueueSystemBatch('system', lines)`. A profile runscript runs exactly that way. The only difference is where the file lives.

### Scope decisions

1. **Which file wins — per source, runscript first.** Profile directories are searched in their existing order: the project's `profiles/`, then the Janissary installation's `profiles/`. Within one directory, `<name>.rs` wins over `<name>.json`. A project file of either kind still overrides a built-in file of either kind, so a project `foo.json` beats a built-in `foo.rs`. That keeps the existing rule that a project profile overrides a same-named built-in one.
2. **What counts as present.** Any directory entry named `<name>.rs` makes that profile a runscript profile. The read then refuses a symlink or non-regular entry, the same rule `readRunscript` applies, and reports `Could not read runscript for profile "<name>".`. A broken `.rs` never falls through silently to the `.json` beside it.
3. **Where it runs — the managed system shell.** The lines are queued to the system shell through the same step `execute` uses, so they share its FIFO with scheduled and manual runs. A system shell that cannot start reports its own failure, and the launch adds nothing.
4. **What the launch prints.** On success, nothing, matching `execute` and the scripts tab's Run. An empty runscript queues nothing and reports nothing. A rejection from the async step (the system shell throwing, say) goes through the manager's existing `finish`, so the issuing transcript gets `Profile command failed: <reason>.`.
5. **No relaunch side effects.** A runscript profile opens no tabs, so the relaunch rule (closing tabs that match entries), monitors, layout, and placement do not apply. The `.json` beside a `.rs` is not read at all, so a malformed one beside it is never reported.
6. **Listing.** `profile list` and the picker list each profile name once per source, whether it comes from a `.rs` file, a `.json` file, or both. Only regular files are listed, as today.
7. **Names.** The profile name is used as typed, the same as for `.json` profiles. It is not restricted to runscript names, because a profile named `Writing_Code` already launches from `Writing_Code.json`, and the `.rs` rule should apply to the same names.

### Rejected alternatives

- **Checking only the project's `profiles/`.** That would make the built-in directory follow different rules from the project's one for no reason. Per-source precedence costs one extra check.
- **Running the runscript in the issuing tab.** Runscripts already have one execution home, the managed system shell, and `execute` deliberately runs there even from a workspaced shell. A second way to run the same file would be a shadow execution path.
- **Printing a confirmation line.** Every other way to run a runscript is silent on success. Starting one more style here would make the three disagree.

## Implementation steps

1. **Share the runscript read and queue steps.**
   - `src/schedule/system/runscript-files.ts`: extract the file half of `readRunscript` into an exported `readRunscriptFile(file)`. It returns `{ exists, lines, text }`, reports `exists: false` for a missing file, and throws for a symlink or non-regular entry. `readRunscript` keeps its name check and directory check and then returns `{ file, ...readRunscriptFile(file) }`.
   - `src/commands/execute.ts`: extract the shell step of `runRunscriptNow` into an exported `queueRunscriptLines(managers, lines)`, which ensures the system shell and queues the lines when it is up. `runRunscriptNow` calls it.
2. **Resolve a profile to its file.**
   - `src/profiles.ts`: add `resolveProfile(name)`, returning `{ kind: 'runscript' | 'config'; file }` or `undefined`. It checks the project directory first and the Janissary directory second, and within each it checks for an entry at `<name>.rs` (with `lstat`, so a symlink counts as present) before `<name>.json`. It returns `undefined` before `initProfileDir` runs, as `profileExists` does today. The presence helper carries one comment saying why it does not follow links, since that is the one non-obvious choice.
   - Remove `profileExists`. Its only production caller is `ProfileManager.run`, which switches to `resolveProfile`.
   - `listProfileDir`: list regular files ending in `.json` or `.rs`, strip the extension, and drop duplicate names before sorting.
   - Update the module's header comment to say a profile is a `.json` file or a `.rs` runscript.
3. **Launch the runscript.**
   - New `src/profile/runscript.ts` exporting `launchProfileRunscript(managers, name, file, out)`. It reads the file with `readRunscriptFile`, writes `Could not read runscript for profile "<name>".` when the read throws, writes `No profile named "<name>".` when the file is gone by the time it is read, and otherwise awaits `queueRunscriptLines`.
   - `src/profile/manager.ts`: replace the `profileExists` check with `resolveProfile`. A `runscript` result goes to `this.finish(launchProfileRunscript(...), out)` and returns. A `config` result keeps the existing load, malformed, no-tabs, and launch path unchanged.
4. **Tests** (see Tests).
5. **Spec, help, and user documentation** (see Spec updates and Documentation).

## Tests

- `src/profiles.test.ts`:
  - `resolveProfile` returns the `.json` file as `config` when only that exists, and `undefined` for a missing name.
  - `resolveProfile` returns the `.rs` file as `runscript` when both `<name>.rs` and `<name>.json` are in the project directory.
  - A built-in `.rs` is used when the project has no file of that name, and a project `.json` beats a built-in `.rs` of the same name.
  - A symlink at `<name>.rs` still resolves as `runscript`.
  - Listing shows a `.rs`-only profile, and shows a name with both a `.rs` and a `.json` once.
  - Replace the existing `profileExists` assertions with `resolveProfile` assertions.
- `src/profile/runscript.test.ts` (new, in the style of `src/commands/execute.test.ts`, with fake `tab` and `systemShell` managers):
  - Queues the parsed lines to `system` as one batch after ensuring the shell, and writes nothing.
  - An empty runscript queues nothing and writes nothing.
  - A symlinked runscript writes `Could not read runscript for profile "<name>".` and never ensures the shell.
  - A runscript removed before it is read writes `No profile named "<name>".` and never ensures the shell.
  - A system shell that fails to start queues nothing and writes nothing.
- `src/profile/manager.test.ts`:
  - `profile launch <name>` with both `<name>.rs` and a valid `<name>.json` queues the runscript's lines and opens no tab.
  - A `.rs` beside a malformed `.json` runs the runscript and does not report the profile as malformed.
  - A runscript-only profile launches rather than reporting `No profile named`.
  - A runscript launch whose system shell rejects writes `Profile command failed: <reason>.`.
  - `profile list` lists a runscript-only profile.
- `src/schedule/system/runscript-files.test.ts` and `src/commands/execute.test.ts` stay green unchanged, pinning that the extractions did not change `readRunscript` or `execute`.

## Spec updates

- `product/specs/profiles.md`:
  - Storage: a profile is a JSON file or a `.rs` runscript, and the per-source precedence from decision 1.
  - New `### Runscript profiles` section covering decisions 2–5 and the failure line.
  - `profile launch <name>`: a runscript profile runs its runscript instead of opening tabs.
  - `profile list` and the picker paragraph: `.rs` files are listed too, one row per name.

## Documentation

- `help/profile.md`: add the use case "Run a profile's runscript, `profiles/<name>.rs`, instead of opening its tabs."
- `documentation/user-documentation/automation/profiles.md`: one paragraph in "Writing a profile" saying a `profiles/<name>.rs` runscript runs in the system shell instead of the tabs, even with a `.json` beside it, linking to the scheduling page's "Run a runscript now" section.
- `help/commands.md`: no change. The `profile` row does not describe what a launch opens.

## Verification

`$janissary/scripts/run.mjs check-diff` after each step. `npm run check` is not run.

### Results

- `check-diff` green after every step. The only failure along the way was lint on the first draft of `src/profile/runscript.test.ts` (an object-literal default parameter and returned `push` values), fixed in place.
- The five touched test files pass: 72 tests across `src/profile/runscript.test.ts`, `src/profile/manager.test.ts`, `src/profiles.test.ts`, `src/commands/execute.test.ts`, and `src/schedule/system/runscript-files.test.ts`. `src/commands.test.ts` passes after the help page edit.
- `npm run docs:build` passes with the new link to the scheduling page's "Run a runscript now" section.

## Out of scope

- Running a runscript from a subdirectory of `profiles/`, or any file other than `<name>.rs` beside `<name>.json`.
- Changing the runscript grammar, `execute`, the scripts tab, or system schedules.
- Validating profile names, which `.json` profiles do not do either.
- A launch report or notification for a runscript profile.
- Guarding against a runscript that launches its own profile. System-shell lines can be Janissary commands, so a `foo.rs` holding `profile launch foo` runs itself again rather than reaching `foo.json`. The spec states this as an edge case; no loop detection is added.
