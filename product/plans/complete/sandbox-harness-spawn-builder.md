# Split the harness sandbox's spawn builder from the confinement check

**Complexity: 4/10** — an extraction of one function body and its private helpers into a new module, plus moving the tests that only inspect its output onto it; no behavior change.

## Goal

The credential scrub, the per-harness token injection, the install-directory read carve-ins, and the `-D` parameter list of a confined harness spawn are tested on every platform, CI's Linux runners included. Only the check that `sandboxSpawn` wraps through `sandbox-exec` on a confining host stays macOS-only.

## Approach

`sandboxSpawn` in `src/sandbox/index.ts` asks `sandboxWillConfine(dir)` and returns early on a host that cannot confine. Everything after that check only computes paths, the `-D` list, the profile string, and the scrubbed environment, but it is reachable only through the probe, so 28 tests that read nothing but `result.args` and `result.env` are `it.skipIf(!sandboxAvailable())`.

The browser path already has the right shape: `browserSpawn` receives the `confinable` decision as an argument. Give the harness path the same split. Move the post-check body into `confinedHarnessSpawn(options, dir, command, args, env)` in a new `src/sandbox/harness-spawn.ts`, with the private helpers only it uses (`homeDParams`, `resolveExecutableDirs`, `packageRootDir`, `serverNodeDirs`, `parentGitObjectsDir`, `claudeScratchDir`). Like `environment.ts`, the new module names the slice of `SandboxOptions` it reads rather than importing the type back out of `index.ts`, which would be an import cycle. `sandboxSpawn` keeps the probe, the browser dispatch, the unconfined pass-through, and a call to the builder.

The builder's dependencies already return a value off macOS rather than throwing: `darwinUserCacheDir` catches the failed `getconf` and returns a placeholder, `resolvePath` falls back to its input, `resolveExecutableDirs` and `playwrightPackagePaths` fall back to placeholders, and `serverNodeDirs` reads `process.execPath`.

## Implementation steps

1. Create `src/sandbox/harness-spawn.ts` holding `confinedHarnessSpawn` and the helpers above, moved verbatim.
2. In `src/sandbox/index.ts`, replace the body after the unconfined return with a call to `confinedHarnessSpawn`, and drop the imports only the builder used.
3. Update the two comments that point at `resolveExecutableDirs` and `homeDParams` in `sandbox/index.ts` (`src/browser/playwright-paths.ts`, `src/sandbox/browser/profile.ts`) to name the new module.

## Tests

- New `src/sandbox/harness-spawn.test.ts`: every case from `src/sandbox/index.test.ts` that only reads `result.args` and `result.env` of a confined spawn, unskipped and pointed at `confinedHarnessSpawn` — the secret-deny and read carve-in bindings, the shell startup files, the `ai/`, `scripts/` and `security/` carve-ins, the installed skill directories, the install root left out, the install root and the scrub, every token injection and ambient-key case, `TMPDIR`, the offline profile, and the git identity pair.
- Replace `includes every -D param the profile references`, which checked four hard-coded names, with the derived check `src/sandbox/browser/profile.test.ts` uses: collect every `(param "…")` the profile names and assert each has a `-D` binding, for the online profile, the offline profile, and a profile with one installed-skill directory.
- `src/sandbox/index.test.ts` keeps the pass-through and unconfined cases, plus one `it.skipIf(!sandboxAvailable())` case asserting `sandboxSpawn` wraps through `sandbox-exec` on a confining host.

## Out of scope

- The live confinement tests (`src/sandbox/live.sandbox.test.ts`, `src/sandbox/pty.sandbox.test.ts`, `src/sandbox/keychain.sandbox.test.ts`), which genuinely need macOS.
- Any change to the profile, the `-D` list, or the environment rules.
