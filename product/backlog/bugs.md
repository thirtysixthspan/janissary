# bugs

## ready

* Make `profile save` create the project profiles directory instead of failing with a raw ENOENT

Existing Bug: On a project that has never had a `profiles/` directory, `profile save <name>` fails with `Profile command failed: ENOENT: no such file or directory, open '<project-dir>/profiles/<name>.json.<uuid>.tmp'` and writes no profile, where the spec has the save capture the running session into `profiles/<name>.json` and names `initProfileDir` as what establishes that directory. Severity: 7/10

Existing Risk: 6/10 - Every fresh project fails on its first `profile save`, and the message names a temporary file rather than the missing directory, so the user has to guess that a plain `mkdir profiles` is the missing step before the whole feature becomes usable.

Proposal Risk: 3/10 - Creating the directory at startup puts a new top-level `profiles/` into every project directory, which some users will not want committed, and the save must still degrade cleanly when that directory is read-only rather than failing the way it does now.

Proposal: The spec promises that "Project profiles live in a top-level `profiles/` directory (`initProfileDir` in `src/main.ts`), kept separate from `.janissary/` so they are committable and are **not** cleared on launch", and that `profile save <name>` "Captures the running session into a single `profiles/<name>.json`". Reproduce it against a fresh scratch project directory with the app on a loopback address: open a file so there is something to capture (`newfile prof.md`), then type `profile save scratchprofile`. Expected: a saved-profile report naming the tabs captured. Observed: `Profile command failed: ENOENT: no such file or directory, open '/…/work/profiles/scratchprofile.json.5caf6ba8-db1b-4f06-ab3d-dd660fff4df9.tmp'.`, no file written, and `profile validate scratchprofile` then reporting `No profile named "scratchprofile".`. The counterfactual pins the cause: after `shell mkdir -p profiles` in the same session and with nothing else changed, the same save reports `Saved profile "scratchprofile": 1 editor tab, layout. Window size not captured (no window open).`, `profile validate scratchprofile` reports `Profile "scratchprofile" is valid.`, and `profile list` shows `scratchprofile` ahead of the built-ins. `initProfileDir` in `src/profiles.ts` only assigns `projectProfileDir` and `janissaryProfileDir` from their base directories and returns — it never creates either, so nothing at startup establishes the project directory. The save path goes through `saveProfile` in `src/profile/save/index.ts`, which hands the file to `atomicWriteFile` in `src/atomic-write.ts`; that writes `<file>.<randomUUID()>.tmp` next to the target and renames it, so with no `profiles/` directory the very first `writeFileSync` throws ENOENT, the temp file is removed, and the error propagates to the transcript. Create the project directory in `initProfileDir` (or have the save ensure it exists before writing), and keep reporting a write failure as a message that names the profile rather than the temp path. `src/profiles.test.ts` and the `src/profile/` suite all stage their fixtures by creating `profiles/` themselves — `src/profile/file.test.ts`, `manager.test.ts` and `validate.test.ts` each `mkdirSync(path.join(root, 'profiles'))` before writing — so nothing covers a project that has none; a regression test should point the profile directory at a fresh root and assert that `profile save` writes `profiles/<name>.json` without the directory having been made first.

## development

## deferred

* when closing harness tabs, the tab disappears, but the UI is not responsive for many seconds afterwards. the UI should retain responsible when closing harness tabs. Any teardown should be completed in the background, asynchronously. This may only apply to local tabs. more research needed.

*  saw this error: Already monitoring with persona "assistant" monitoring using the same assistant may happen multiple time but for different targets. in this case a new monitoring window should be opened

## declined
