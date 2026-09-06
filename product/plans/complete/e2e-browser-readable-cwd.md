# Plan: Start the e2e browser child inside its readable scratch directory

**Complexity: 2/10** — the production change is one spawn option, with one focused regression assertion and one concise clarification to the existing sandbox behavior spec.

## Root cause

`spawnBrowserChild` launches the confined Node process without a `cwd`, so it inherits the Janissary server's current working directory. In a development workspace that directory sits under `$HOME` and outside the browser profile's narrow runtime carve-ins. Node 24 queries its current directory during pre-execution, Seatbelt rejects that read, and Node exits before loading Janissary with `EPERM` from `uv_cwd`.

## Correct behavior

The e2e browser child starts in its freshly allocated browser scratch directory. That directory is deliberately readable and writable under the browser profile, so Node can complete startup without widening the browser's access to the project or other user data.

## Reproduction

Running `npx vitest run --project server src/browser/e2e-server-launch.test.ts` with the new `starts the child inside its readable scratch directory` assertion fails on the buggy code: `spawn()` receives `cwd: undefined` instead of `/ws/browsers/bot-token`. A direct nested Seatbelt probe is unavailable in the workspaced test environment because macOS rejects nested `sandbox-exec` with `sandbox_apply: Operation not permitted`; the reported child output is Node 24.11.0 exiting from `uv_cwd` with `EPERM`.

## Approach

Pass the already allocated `scratch.dir` as the `cwd` in the browser child's `spawn` options. This keeps the fix at the process boundary where the bad inheritance occurs and uses the directory the lifecycle already owns, removes, and grants through the sandbox profile.

## Implementation steps

1. Update `src/browser/e2e-server.ts` so the child process is spawned with `cwd: scratch.dir` alongside its existing stdio and environment options.
2. Keep the focused launch regression in `src/browser/e2e-server-launch.test.ts`, proving the spawn starts in the readable scratch allocation.
3. Update `product/specs/sandbox.md` to state that the browser child uses its scratch directory as its working directory so startup never depends on access to Janissary's working directory.
4. Run `./scripts/run.mjs check-diff` after each implementation change, then rerun the focused reproduction.

## Regression test

`starts the child inside its readable scratch directory` in `src/browser/e2e-server-launch.test.ts` inspects the actual spawn contract. It fails without the fix because `cwd` is absent and passes only when the child is explicitly rooted in the scratch allocation.

## Documentation

No `help.md` or user-documentation update is needed. Both already promise that the managed browser runs inside its empty scratch directory; this fix makes startup honor that promise without changing commands, flags, or user-visible behavior.

## Out of scope

- Widening the browser sandbox profile to permit Janissary's current working directory.
- Changing the harness process working directory.
- Adding browser restart or supervision after a genuine browser crash.
- Making sandbox-backed integration tests nest inside a workspaced harness.
