# Restore Codex managed-preferences loading inside workspaces

**Complexity: 3/10.** One sandbox permission, a native macOS regression test, and documentation. The same profile serves local and remote workspace launches.

## Reproduction and root cause

The invocation reported `harness codex on anonymouscoward@10.27.1.94:dev/janissary` exiting with `Error: account/read failed during TUI bootstrap: account/read failed: failed to load workspace requirements (code -32603)`.

Reproduced over SSH on that host with Codex 0.157.0, using the checkout's built `buildHarnessCommand` and `spawnPty` against a disposable Git workspace under `temp/codex-bootstrap-repro/`. Skipping Codex's update offer produced the exact error and exit status 1. A scratch `log_dir` exposed `Failed to synchronize managed preferences` as the underlying error.

A CoreFoundation probe first reads the `requirements_toml_base64` preference in `com.openai.codex`, then calls `CFPreferencesAppSynchronize`, as Codex does during startup. The shipped sandbox returns 0. Adding read access only to POSIX shared-memory names beginning `apple.cfprefs.` returns 1. A preference-domain read rule alone and a preference-file read rule alone both still return 0. The cache synchronization needs the preferences service's shared memory in addition to the existing Mach service access.

## Correct behavior

A sandboxed Codex harness must load the host's managed preferences and finish TUI bootstrap, including over SSH. Administrator requirements remain enforced; the launch must retain workspace confinement and its existing `--no-daemon` behavior.

## Approach and implementation

1. Add a macOS integration test under `src/sandbox/` that exercises the real CoreFoundation preference-read and synchronization sequence under both shipped profiles. Observe it failing before adding the permission. Keep temporary files inside the repository's ignored `temp/` directory and release test resources.
2. Add `(allow ipc-posix-shm-read* (ipc-posix-name-prefix "apple.cfprefs."))` to the harness profile's IPC section. Add a short comment explaining that Codex's managed-requirements bootstrap needs preference-cache synchronization. Grant no shared-memory writes and no general shared-memory access. Run the native regression test and `./scripts/run.mjs check-diff`.
3. Update `product/specs/sandbox.md` and the existing workspace discussion in `documentation/user-documentation/advanced-agents/harness.md`. The command syntax and `help.md` summary do not change. Run the diff checks after the documentation step.
4. Verify the original remote bootstrap with the fixed profile, then verify through a scratch live Janissary instance using the attached browser when possible. Record exact observations and tear down every scratch process.
5. Move this plan to `complete/`, run the PR gate, and open a `fix(sandbox)` pull request. Leave the unrelated `shop_insert.sql` untracked and leave the PR open for review.

## Regression test

Use a native CoreFoundation probe to read the requirements preference before synchronizing it. Calling synchronization alone is insufficient: it succeeds without initializing the preference cache and would miss this regression. Also prove an unrelated shared-memory object remains unreadable and the preference-cache permission does not allow writes. Tests must fail on a sandbox that never applied, rather than treating that environmental failure as a successful denial.

## Verification

- Remote reproduction: exact reported TUI error and exit status 1 observed before the fix.
- Native regression: all four tests failed before the permission was added and pass with it. Both online and offline profiles synchronize preferences, permit preference-cache reads, and deny writes and unrelated shared-memory reads.
- Diff checks: lint, typechecks, and all 1,151 related server tests pass. Suppress Node 24's SQLite experimental warning with `NODE_OPTIONS=--disable-warning=ExperimentalWarning`; otherwise existing remote-rendezvous tests receive the warning before their expected handshake line.
- Build: `npm run build` passes.
- Remote terminal: the original reproduction driver reached OpenAI Codex 0.157.0's loaded-model composer with a staged copy of the fixed build. Its new log did not contain the preference-synchronization error.
- Live browser: started this checkout under `temp/fix-a-bug/` with scratch HOME and used the attached browser through `e2e-driver`. Ran `harness codex as bootstrap-check on anonymouscoward@10.27.1.94:dev/janissary/temp/codex-live-root`; a scratch SSH wrapper selected the fixed build staged on that host. The driver observed the active remote tab, loaded model, and ready composer with no bootstrap error. The screenshot confirmed that result. No installed remote code was replaced. Scratch local and remote servers stopped and test artifacts were removed.
- PR gate: passed with 763 test files, 11,211 passing tests, one skipped test, full typechecks, lint, and CSS checks. One existing unused-disable lint warning remains in `src/tab/cleanup.test.ts`. Run with the canonical system `TMPDIR` outside the checkout, `NODE_OPTIONS=--disable-warning=ExperimentalWarning`, and `VITEST_MAX_WORKERS=4` on this Mac. This avoids the `/var` versus `/private/var` path mismatch and resource-related timeouts; keeping fixtures outside the checkout also preserves non-repository test scenarios.

## Out of scope

Codex updates, authentication changes, administrator-policy overrides, shared-daemon behavior, SSH transport changes, broad preference-file or shared-memory access, and unrelated sandbox failures. No backlog entry matches the invocation, so `product/backlog/bugs.md` stays unchanged.
