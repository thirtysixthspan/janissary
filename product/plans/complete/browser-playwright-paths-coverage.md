# Cover the Chromium bundle resolution the browser profile depends on

**Complexity: 4/10** — one new test file and a small extraction to make the part worth testing reachable without an installed browser. No behaviour changes. The care is in testing the walk against constructed layouts rather than against whatever Playwright happens to have put on the machine, since the second kind of test passes for the wrong reason on the developer's host and proves nothing on anyone else's.

## Goal

`src/browser/playwright-paths.ts` arrives with no colocated test file. What `chromiumBundleDir` returns is the single path the browser's Seatbelt profile grants Chromium read access to, and nothing in the suite exercises it: `src/browser/e2e-server.test.ts` replaces the whole module with a stub, and `src/sandbox/browser-profile.test.ts` supplies the bundle directory as a fixture. So the ancestor walk, its three fallbacks, `packageDirOf`'s manifest walk, and the placeholder that keeps a Seatbelt `-D` parameter bound to *something* are all uncovered.

A wrong answer here fails in one of two directions, and no test in the suite would move for either: too narrow and the browser cannot start on a host nobody can reproduce, too wide and a Seatbelt carve-in reaches past the bundle.

## Approach

Split the resolution into the part that talks to the world and the part that decides. `findChromiumBundleDir` currently does both: it requires `playwright`, calls `chromium.executablePath()`, realpaths the result when it exists, and then walks ancestors looking for a `.app`. Only the walk has interesting behaviour, and only the walk can be tested against layouts that do not exist on the machine running the test.

Extract the walk as an exported pure function taking an already-resolved executable path. `findChromiumBundleDir` keeps the resolution and the realpath and calls it; `chromiumBundleDir` stays the memoized wrapper over that. The test then drives the walk with constructed macOS-shaped, bare, and doubly-bundled paths and never depends on a browser being installed.

`packageDirOf` genuinely touches the filesystem — it is a manifest walk — so it is tested against real temporary directories rather than mocked.

## Design decisions

1. **The walk takes a resolved path and does no I/O.** `path.extname` and `path.dirname` are all it needs, so it can be handed `/anywhere/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing` and asked what it resolves to, with nothing on disk. That is the whole reason to extract it: a test that asserted only on the ambient `chromiumBundleDir()` would pass on a machine where Playwright happens to be installed in the usual place and prove nothing about the layouts it is meant to handle.

2. **`chromiumBundleDir()` is still asserted against the real installation, once.** The extraction makes the walk testable but the composition still needs one check that the pieces are wired together: that the ambient call returns either a `.app` directory or the placeholder, and never something in between like `Contents` or `MacOS`. The proposal that recorded this finding names exactly this risk — a real installation whose shape nobody anticipated — so the composed function keeps a test rather than being left to the unit test of its parts.

3. **Memoization is proved where it can be, and only claimed where it cannot.** `playwrightPackagePaths` caches an object, so two calls returning the identical reference is real proof. `chromiumBundleDir` caches a string, where `===` proves nothing about whether the work was repeated. The string case is tested for stability and the test says that is what it covers, rather than dressing it up as a caching assertion.

4. **`packageDirOf` and the specifier resolver are exported for the test rather than reached through mocks.** Mocking `node:module`'s `createRequire` to force a resolution failure would be testing the mock. Exporting the two small functions and calling them with a specifier that genuinely cannot resolve tests the branch that actually runs. The placeholder constant is exported alongside them so the test names the same value the code does instead of repeating the literal.

5. **`e2e-server.test.ts`'s stub of this module stays.** That suite is testing the browser server's lifecycle and has no business loading Playwright. The point here is to test this module directly, not to unstub it elsewhere.

6. **`src/sandbox/index.test.ts` is not touched.** It already asserts that both Playwright package directories bind to real paths for every sandboxed spawn, which is the integration-level claim; it must keep passing unchanged.

## Implementation steps

1. **`src/browser/playwright-paths.ts` — the extraction.** Export the ancestor walk as `bundleDirOf(resolvedExecutable: string): string`: walk up from the executable's directory, return the first ancestor whose extension is `.app`, and fall back to the executable's own directory on reaching the filesystem root. `findChromiumBundleDir` keeps the `require`, the `executablePath()` call, the empty-string check, and the `existsSync`/`realpathSync` step, then returns `bundleDirOf(resolved)`. `chromiumBundleDir` is unchanged.

2. **`src/browser/playwright-paths.ts` — the other exports.** Export `packageDirOf` as it stands. Rename `resolveDir` to `resolvePackageDir` and export it. Rename `MISSING` to `PLAYWRIGHT_PATH_PLACEHOLDER` and export it, updating its three uses. Keep every comment; extend the module header with one sentence on why the walk is separate from the resolution.

3. **`src/browser/playwright-paths.test.ts` — new.** The cases listed under Tests below.

## Tests

New file `src/browser/playwright-paths.test.ts`.

`bundleDirOf`, driven with constructed paths and no filesystem:
- A macOS-shaped path ending `…/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing` resolves to the `.app` directory, and specifically not to `Contents` or `MacOS`.
- A bare non-bundled executable (`/opt/chromium/chrome`) resolves to its own directory rather than walking up to the filesystem root.
- A path with an `.app` ancestor above another `.app` resolves to the nearest one, which is the containment-relevant answer: the wider bundle would be a wider carve-in.
- An executable sitting directly inside a bundle, with no `Contents/MacOS` beneath it, still finds the bundle.

`packageDirOf`, against temporary directories:
- An entry file nested below a directory holding a `package.json` resolves to that directory.
- The nearest manifest wins when two are stacked.
- An entry with no `package.json` in any ancestor falls back to the entry's own directory rather than to the root.

`resolvePackageDir` and the placeholder:
- A specifier that cannot resolve returns `undefined` — the branch that produces the placeholder.
- `playwrightPackagePaths().dirs` are each either a real directory or `PLAYWRIGHT_PATH_PLACEHOLDER`, never empty and never undefined, so a Seatbelt `-D` parameter is always bound to something.
- `playwrightPackagePaths()` called twice returns the identical object, which is the memoization.

`chromiumBundleDir`, composed:
- Returns either a directory whose extension is `.app` or the placeholder, and never a path whose last segment is `Contents` or `MacOS`.
- Two calls agree. (Stability, not a caching assertion — see design decision 3.)

`src/sandbox/index.test.ts` and `src/browser/e2e-server.test.ts` must both keep passing untouched.

## Out of scope

- Unstubbing this module in `e2e-server.test.ts`.
- Downloading a browser, or any test that requires one to be installed. The whole point of the extraction is that the interesting behaviour is reachable without one.
- The `$HOME` deny and the carve-in rules in `src/sandbox/browser-profile.ts`, which have their own suite.
- Changing what any of these functions returns. This is coverage for behaviour that is already correct.
- Windows and Linux bundle layouts. `.app` is a macOS concept and the fallback path is what those hosts take; the bare-executable case covers it.

## Verification

`./scripts/run.mjs check-diff` — lint, typecheck, and the server suite, with the new file passing and `index.test.ts` and `e2e-server.test.ts` unchanged.

`npx vitest run --project server src/browser/playwright-paths.test.ts` on its own, to confirm the file does not depend on suite ordering or on another file having loaded Playwright first.

By hand, the assertion that matters most: compare what `chromiumBundleDir()` returns on this host against the `chromium` parameter the browser profile actually binds in `src/sandbox/browser-spawn.ts`, and confirm the carve-in is the `.app` directory and not an ancestor of it.
