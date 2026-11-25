# List only runnable scripts in the script runner

**Complexity: 3/10** — 6 requirements, 7 test scenarios, ~20 added lines in 1 existing file plus a new module (p=4.70)

## Goal

Running `scripts/run.mjs` with no argument prints the scripts it can run. Today it lists every entry in `scripts/`, so the listing includes the `e2e`, `docs-screenshots`, and `release` directories, shows `docs-screenshots` and `release` twice, and lists every `*.test.mjs` Vitest file. None of those directories or test files can be run through the runner. This change makes the listing show only `.mjs` and `.sh` script files, each name once, so an agent or contributor reading it sees only scripts they can actually run.

## Requirements

1. The listing leaves out directories. From the issue: "the listing includes e2e, docs-screenshots (twice — directory and .mjs), and release, which would fail if invoked."
2. The listing includes only files ending in `.mjs` or `.sh`. From the issue: "Filter to files with .mjs/.sh extensions".
3. Each script name appears once, even when more than one entry maps to it. From the issue: "and dedupe."
4. The listing leaves out `*.test.mjs` files. They are Vitest suites that fail when run with plain `node`, so they fall under the issue's "advertises non-runnable scripts."
5. The listing still leaves out `run.mjs` itself.
6. The listing still shows names without their `.mjs` or `.sh` extension, sorted alphabetically.

## Design decisions

- Move the filtering into a new pure module, `scripts/script-listing.mjs`, exporting `runnableScriptNames(entries)`. It takes directory entries and returns the sorted, deduplicated names. Keeping it pure lets the test cover directories and duplicates with fake entries, without depending on whatever happens to sit in `scripts/` today.
- `run.mjs` reads the directory with `withFileTypes: true` and passes the entries in, so the module can tell files from directories without touching the filesystem. See Assumption 2.
- Exclude test files by their `.test.mjs` suffix, because that's the naming the server Vitest project includes. See Assumption 3.
- Leave script resolution alone. Only the no-argument listing changes. See Out of scope.

## Preserved behavior

None found. No existing test covers the runner's listing, so requirements 5 and 6 carry the behavior that must continue and the new tests pin it.

## Assumptions

1. The listing is built from a bare directory read: `scripts/run.mjs:17` "`const scripts = readdirSync(scriptsDir)`".
2. The current filter only drops the runner and strips extensions: `scripts/run.mjs:18` "`.filter((f) => f !== 'run.mjs')`" and `scripts/run.mjs:19` "`.map((f) => f.replace(/\.(mjs|sh)$/, ''))`".
3. Test files under `scripts/` are named `*.test.mjs`: `vitest.config.ts:14` "`'scripts/**/*.test.mjs'`".
4. `scripts/` holds no symbolic links today, so treating only regular files as scripts drops nothing that runs.

## Existing functionality

1. Sorting with `toSorted` and `localeCompare`, kept as is: `scripts/run.mjs:20` "`.toSorted((a, b) => a.localeCompare(b))`".
2. The runner's script directory, resolved from its own location: `scripts/run.mjs:11` "`const scriptsDir = path.dirname(fileURLToPath(import.meta.url));`".

## Implementation steps

1. Add `scripts/script-listing.mjs` exporting `runnableScriptNames(entries)`. It keeps file entries whose names end in `.mjs` or `.sh`, drops `run.mjs` and names ending in `.test.mjs`, strips the extension, dedupes, and sorts. Build command: `$janissary/scripts/run.mjs check-diff`.
2. In `scripts/run.mjs`, read `scriptsDir` with `withFileTypes: true` and build the listing from `runnableScriptNames`. The printed format stays `Available scripts:` followed by two-space-indented names. Build command: `$janissary/scripts/run.mjs check-diff`.
3. Add `scripts/script-listing.test.mjs` covering the cases below. Build command: `$janissary/scripts/run.mjs check-diff`.
4. Add `product/specs/script-runner.md` describing the runner's listing and resolution. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. `scripts/run.mjs` run with no argument prints `Available scripts:` and then one two-space-indented name per line, as before. Directories, test files, and repeated names no longer appear. For example, `release` appears once and `e2e` doesn't appear.

## Tests

- `scripts/script-listing.test.mjs`: a directory entry is left out (Requirement 1).
- `scripts/script-listing.test.mjs`: entries with other extensions, such as `.md` or `.json`, are left out (Requirement 2).
- `scripts/script-listing.test.mjs`: a directory and a file with the same base name, or a `.mjs` and `.sh` with the same base name, give one name (Requirement 3).
- `scripts/script-listing.test.mjs`: `*.test.mjs` files are left out (Requirement 4).
- `scripts/script-listing.test.mjs`: `run.mjs` is left out (Requirement 5).
- `scripts/script-listing.test.mjs`: names come back without extensions, sorted (Requirement 6).
- `scripts/script-listing.test.mjs`: running `scripts/run.mjs` with no argument prints a listing that includes `check-diff`, lists `release` once, and has no `e2e` or `.test` entries (Requirements 1, 3, 4).

## Out of scope

- How `run.mjs <name>` resolves a script, including its bare-name candidate that can match a directory.
- Hiding helper modules such as `script-path.mjs` or `changed-files.mjs` that other scripts import. Telling a library module from an entry point would need a new convention.
- Updating `AGENTS.md`, whose "lists all available scripts" line stays accurate.

## Verification

Run `$janissary/scripts/run.mjs check-diff`; the new tests pass.

Then run `node scripts/run.mjs` from the repo root. The output starts with `Available scripts:`, lists `release` and `docs-screenshots` once each, and has no `e2e` line and no name ending in `.test`. A second `release` line, an `e2e` line, or a `lint-files.test` line means the filter isn't in effect.
