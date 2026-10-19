# Runscripts directory from one helper
**Complexity: 1/10** — one private function changes the source of its scripts directory, and one regression case is added beside the existing ensure case.

## Goal

Make `makeScriptsDirectory` take the runscripts directory from `runscriptsDirectoryPath(projectRoot)`, so the directory that is created, the directory that reads and listings use, and the directory that files are written into are defined in one place. Behavior does not change: the path on disk stays `<root>/.janissary/scripts`, and the state directory check still runs first.

## Design decisions

- Plan `01-runscript-file-operations` says `makeScriptsDirectory`'s body does not change, and it also says the reads and the writes all build the directory from `runscriptsDirectoryPath`. The second statement is the design decision. `makeScriptsDirectory` was the one place that still joined `scripts` onto the state directory itself, so this plan supersedes that single line of `01`. `01` stays in `complete/` with its original text.
- The state directory check stays first and the scripts directory check stays second. A symlinked `.janissary` still throws from the state directory check before anything is created, which is what the existing symlink cases expect.
- `ensureScriptsDirectory`, `createRunscript`, `inspectScriptsDirectory`, and every exported signature stay unchanged. `makeScriptsDirectory` stays private.
- The entry adds no behavior. The honest test is a regression case that pins the directory through the helper's output, so that a later edit to the helper alone cannot split the directory that is created from the one that reads and writes use.

## What already exists

- `runscriptsDirectoryPath` in `src/schedule/system/runscript-files.ts` already returns `path.join(projectRoot, '.janissary', 'scripts')`. Inspection, reads, creation, cloning, and untitled naming already use it.
- The existing cases in `src/schedule/system/runscript-files.test.ts` that create the state and scripts directories through `ensureScriptsDirectory`, that refuse symlinked state and scripts directories, and that cover `createRunscript` stay as they are and must pass untouched.

## Proposed changes

In `src/schedule/system/runscript-files.ts`, `makeScriptsDirectory` takes its scripts directory from the helper. Its state directory line and its two checks keep their order:

```ts
function makeScriptsDirectory(projectRoot: string): void {
  const stateDir = path.join(projectRoot, '.janissary');
  const scriptsDir = runscriptsDirectoryPath(projectRoot);
  if (!assertDirectory(stateDir)) mkdirSync(stateDir);
  if (!assertDirectory(scriptsDir)) mkdirSync(scriptsDir);
}
```

No other function in the file changes.

## Tests

In `src/schedule/system/runscript-files.test.ts`, add one case beside the ensure case, named `creates the scripts directory at the path the reads and writes use`. In a plain temporary project, it calls `ensureScriptsDirectory`, then asserts that `.janissary/scripts` is a directory, that `readRunscript` names `deploy.rs` inside it, that `createRunscript` returns that file with `created: true`, and that the directory then lists only `deploy.rs`.

The case passes before and after the production change, because the path does not move. It fails if the directory the helper names diverges from the one the directory creation or the create path uses, since the assertions pin `.janissary/scripts` through the same helper. No existing case changes, and no other test file changes.

## Verification

Run `./scripts/run.mjs check-diff`. Read the diff to confirm that the state directory check still precedes the scripts directory check in `makeScriptsDirectory`, and that `ensureScriptsDirectory` still calls the Git exclusion step before `makeScriptsDirectory`.

## Specs and documentation

No spec or help change, because no user-visible behavior changes.

## Out of scope

- `ensureScriptsDirectory`, `createRunscript`, `inspectScriptsDirectory`, `assertDirectory`, and every exported signature.
- Plan `01-runscript-file-operations` in `product/plans/complete/`, which keeps its original text.
- The other entry in `product/backlog/pull-request.md`.
