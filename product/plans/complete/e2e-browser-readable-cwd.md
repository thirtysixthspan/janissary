# Plan: Start the e2e browser child inside its readable scratch directory

**Complexity: 3/10** — the fix sets the child working directory and adds two exact-file sandbox carve-ins, with focused regression assertions and a concise clarification to the existing sandbox behavior spec.

## Root cause

`spawnBrowserChild` launched the confined Node process without a `cwd`, so it inherited the Janissary server's current working directory. Moving it into the browser scratch directory removes that ambient dependency, but source-mode startup still enters through `src/main.ts`. The TypeScript loader follows that entry's static imports to the bundled `agent-names.json` and `harness-models.json` catalogs in the installation root. The browser profile denied those exact files, so Node exited from `Hooks.load` with `EPERM` before reaching the `e2e-browser` branch.

## Correct behavior

The e2e browser child starts in its freshly allocated browser scratch directory. The profile also permits exact-file reads of the two harmless bundled catalogs that the main entry loads. Node can complete startup without widening access to the installation root, project state, or other user data.

## Reproduction

Running `npx vitest run --project server src/browser/e2e-server-launch.test.ts` with the `starts the child inside its readable scratch directory` assertion fails on the original code: `spawn()` receives `cwd: undefined` instead of `/ws/browsers/bot-token`. The later `Hooks.load` trace identifies the remaining denial at the exact `agent-names.json` path. The browser-profile regression checks both bundled catalogs because `harness-models.json` is the next static JSON import in the same entry graph.

## Approach

Pass the already allocated `scratch.dir` as the `cwd` in the browser child's `spawn` options. Add exact-file profile parameters for `agent-names.json` and `harness-models.json`, matching the existing manifest and tsconfig carve-ins. This keeps the installation root denied while admitting every root file the source entry's loader actually reads.

## Implementation steps

1. Update `src/browser/e2e-server.ts` so the child process is spawned with `cwd: scratch.dir` alongside its existing stdio and environment options.
2. Extend `src/sandbox/browser-profile.ts` and `src/sandbox/browser-spawn.ts` with exact-file bindings for both bundled catalogs.
3. Keep the focused launch regression in `src/browser/e2e-server-launch.test.ts`, and extend `src/sandbox/browser-profile.test.ts` to prove both catalogs are readable while an unrelated root file remains denied.
4. Update `product/specs/sandbox.md` with the scratch working-directory and exact-file startup guarantees.
5. Run `./scripts/run.mjs check-diff`, then rerun the focused profile and launch tests.

## Regression test

`starts the child inside its readable scratch directory` in `src/browser/e2e-server-launch.test.ts` inspects the actual spawn contract. `carves in the loader's root files as exact paths, not as a directory` in `src/sandbox/browser-profile.test.ts` proves both statically imported catalogs are readable without exposing another installation-root file.

## Documentation

No `help.md` or user-documentation update is needed. Both already promise that the managed browser runs inside its empty scratch directory; this fix makes startup honor that promise without changing commands, flags, or user-visible behavior.

## Out of scope

- Widening the browser sandbox profile to permit Janissary's current working directory or installation root.
- Changing the harness process working directory.
- Adding browser restart or supervision after a genuine browser crash.
- Making sandbox-backed integration tests nest inside a workspaced harness.
