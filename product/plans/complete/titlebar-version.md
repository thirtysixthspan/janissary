# Show the app version in the titlebar

**Complexity: 3/10** — no new architecture, but the version has to travel through an existing plumbing chain (state broadcast → wire event → client listener → hook) that touches six small files.

## Goal

The window titlebar (via `document.title`) currently reads `Janissary: <project path>`. Change it to `Janissary (<version>): <project path>`, where `<version>` is the app's package version (e.g. `0.5.4`), so the running version is visible at a glance without running `janus --version`.

## Approach

The project directory already rides the existing `state` broadcast (`StateEvent.projectDir` in `src/protocol.ts`, populated in `src/state-event.ts`, carried through `web/src/ws.ts`'s `StateListener`, consumed in `web/src/useServerState.ts`, and rendered by `web/src/useProjectTitle.ts`). Add `version` alongside `projectDir` at every one of those same hops, reusing the version string already computed by `appVersion()` in `src/cli-args.ts` for `--version` and the startup-failure banner — but as the bare semver, not the `name version` pair those call sites want.

## Implementation steps

1. **`src/cli-args.ts`** — extract the package.json read into a small private helper and add an exported `appVersionNumber()` that returns just `pkg.version`; have `appVersion()` call it:
   ```ts
   function readPackageInfo(): { name: string; version: string } {
     const packagePath = path.join(import.meta.dirname, '..', 'package.json');
     return JSON.parse(readFileSync(packagePath, 'utf8')) as { name: string; version: string };
   }

   export function appVersion(): string {
     const pkg = readPackageInfo();
     return `${pkg.name} ${pkg.version}`;
   }

   export function appVersionNumber(): string {
     return readPackageInfo().version;
   }
   ```
2. **`src/protocol.ts`** — add `version: string;` to `StateEvent` next to `projectDir` (~line 87), with a one-line comment mirroring the existing `projectDir` comment style.
3. **`src/state-event.ts`** — import `appVersionNumber` from `./cli-args.js` and add `version: appVersionNumber(),` to the returned object.
4. **`web/src/ws.ts`** — add `version: string` as a new trailing parameter on the `StateListener` type (~line 3) and pass `event.version` at the call site (~line 29).
5. **`web/src/useServerState.ts`** — add a `version` state slot (`useState('')`), pass it to `useProjectTitle`, and read `nextVersion` as a new trailing parameter of the `onState` callback, calling `setVersion(nextVersion)`.
6. **`web/src/useProjectTitle.ts`** — accept a second parameter `version: string`; build the title as `` `Janissary (${version}): ${projectDir}` ``. Keep the existing guard (skip while `projectDir` is empty) unchanged.

## Tests

- **`src/cli-args.test.ts`** — add a test for `appVersionNumber()` mirroring the existing `appVersion` test, asserting it equals `pkg.version` read directly from `package.json`.
- **`web/src/ws.test.ts`** — update the two existing `onState` tests (`:67`, `:82`) to include `version: '1.2.3'` in the fake event payload and assert the listener receives it as the trailing argument.
- **`web/src/useProjectTitle.test.ts`** — update all three existing tests to pass a `version` argument, and update the expected title strings to the new `Janissary (<version>): <path>` format.

## Spec updates

- **`product/specs/cli.md`** or wherever the titlebar behavior is documented — search first; if a spec describes `document.title`/titlebar behavior, update the sentence to mention the version is now included. If none exists, no new spec file is needed since this is a one-line behavior tweak to an already-documented mechanism (check during Step 5 of the fix workflow).

## Verification

- `./scripts/run.mjs check-diff` — lints changed files, typechecks incrementally, runs the affected server + web tests.
- Manual: launch the app (`npm start` or `janus`) and confirm the window/tab title reads `Janissary (<version>): <project path>`.

## Out of scope

- Any change to `appVersion()`'s existing `name version` output used by `--version` and the startup-failure banner — those keep their current format.
- Any change to how `projectDir` itself is computed or displayed beyond adding the version prefix.
