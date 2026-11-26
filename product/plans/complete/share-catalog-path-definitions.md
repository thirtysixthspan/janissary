# Share the catalog path definitions between the hosts guard and the catalog reader
**Complexity: 4/10** — ~15 added lines across 2 production files, 7 requirements and 8 test scenarios, one exported helper (p=4.95)

## Goal

The hosts guard that refuses import and export of a saved-host catalog and the reader that supplies
saved hosts currently spell the same two locations independently. A future change to the catalog
name or location in the reader can therefore leave the guard watching old paths and refuse nothing,
so an export aimed at the real catalog overwrites every saved host. Give both sides one exported
definition of the project and home catalog paths and pin it with a drift test, so the refusal always
covers the paths that actually supply the hosts.

## Requirements

1. The two catalog locations are exposed by one exported helper that builds them from the existing
   `FILE_NAME` constant and the same `path.join` spelling `readHostsFile` uses
   ("extract the project and home catalog locations into an exported helper built from the existing
   FILE_NAME constant and the same path.join spelling readHostsFile uses").
2. The helper omits the project path when the root is empty
   ("omitting the project path when root is empty").
3. `readHostsFile` takes every path it consults and reports from the helper
   ("change readHostsFile to build its consulted paths from that helper").
4. `isCatalogPath` takes its comparison paths from the helper and no longer spells the segments
   itself ("change isCatalogPath to call that helper instead of rebuilding the paths with literal
   '.janissary' and 'hosts.json'").
5. A project-only fixture fails a drift test when the helper's project path differs from the path
   `readHostsFile` reports ("compares the paths returned by the shared helper with the path reported
   by readHostsFile for a project-only fixture").
6. A home-only fixture fails the same drift test when the helper's home path differs from the path
   `readHostsFile` reports ("and a home-only fixture").
7. The refusal keeps resolving symlinks and alternate spellings against the shared paths
   ("so a future divergence fails a test before the guard can fail open").

## Design decisions

- Export a `catalogPaths(root, home)` helper from `hosts-file.ts` returning `{ project?: string; home:
  string }`. An explicit optional `project` models the empty-root case directly while `home` is
  always present, which lets both call sites stay type-safe without array-index assertions
  (Requirements 1 and 2).
- Build each path with `path.join(<base>, '.janissary', FILE_NAME)` inside the helper, reusing the
  existing constant and spelling, so there is one construction site for the catalog locations
  (Requirement 1).
- Change only path construction in `readHostsFile`: the project-first consultation order, the
  project override even when it holds `{}`, the home fallback, problem collection and notification,
  and the path it reports stay byte-for-byte in behavior (Requirement 3).
- Keep `isCatalogPath`'s `realPath` comparison and its caller unchanged; replace only the two literal
  `path.join` expressions with the helper's paths, skipping the absent project path when the root is
  empty (Requirements 4 and 7).
- Keep the helper in `hosts-file.ts` rather than creating a new module: the file has 166 lines, so a
  helper of roughly ten lines plus one call site stays under the 200-line `max-lines` cap, and the
  guard already imports from this module.
- Add no comments; the helper name states its purpose.
- Record the new guarantee in the existing hosts-tab spec section about catalog files and ssh
  configs. No help page changes, because no command, flag, or key binding changes.

## Preserved behavior

1. A usable project catalog replaces the home catalog entirely, including `{}`, and the home file is
   not consulted while the project file is usable; it must not start being read or reported. Pinned
   by `src/plugins/hosts/hosts-file.test.ts` › `selecting the effective hosts file > selects a usable
   project file over the home file, including an empty object` and the sibling problem-memo case.
2. A missing or unusable project file falls back to the home file and still records the project
   problem; it must not make the whole catalog unusable. Pinned by
   `src/plugins/hosts/hosts-file.test.ts` › `selecting the effective hosts file > falls back from an
   invalid project file to the home file and records the project problem`.
3. Export and import aimed at either catalog, including dot-dot and symlink spellings, are still
   refused with the same message and leave both catalogs byte for byte unchanged; they must not start
   treating a catalog as a config. Pinned by `src/plugins/hosts/activate.test.ts` › `hosts activation
   ssh commands > refuses an export aimed at the home catalog without touching either catalog` and
   its project, dot-dot, symlink, and import siblings.
4. Successful local import and export still report and publish exactly as before; they must not begin
   refusing ordinary config targets. Pinned by `src/plugins/hosts/activate.test.ts` › `hosts activation
   ssh commands > notes a local import, publishes the written catalog, and never opens a tab` and
   `notes a local export report without publishing or opening a tab`.
5. Target read and write failures still report the same diagnostics and leave files untouched; they
   must not be reworded or swallowed by the path change. Pinned by
   `src/plugins/hosts/export-ssh.test.ts` › `reports a mocked write failure with the display path and
   the problem word` and `src/plugins/hosts/import-ssh.test.ts` › `reports a source read failure
   without consulting or writing the catalog` and `reports a failed catalog write verbatim and
   preserves the prior bytes`.

## Assumptions

1. The catalog filename is owned by one constant: `src/plugins/hosts/hosts-file.ts:7`
   `const FILE_NAME = 'hosts.json';`.
2. The reader builds both locations with the same spelling: `src/plugins/hosts/hosts-file.ts:88`
   `const homePath = path.join(home, '.janissary', FILE_NAME);` and `:92`
   `const projectPath = path.join(root, '.janissary', FILE_NAME);`.
3. An empty root already means no project path: `src/plugins/hosts/hosts-file.ts:91` `if (root !== '') {`.
4. The guard rebuilds both locations literally today: `src/plugins/hosts/ssh-intents.ts:41`
   `path.join(root, '.janissary', 'hosts.json'),` and `:42`
   `path.join(home, '.janissary', 'hosts.json'),`.
5. The guard already imports from the reader's module: `src/plugins/hosts/ssh-intents.ts:7`
   `import { readHostsFile, type HostsRead } from './hosts-file.js';`.
6. The reader's tests use colocated fixtures and helpers: `src/plugins/hosts/hosts-file.test.ts:34`
   `const homeFile = (home: string) => path.join(home, '.janissary', 'hosts.json');` and `:6`
   `import { mutateHostsFile, readHostsFile, serializeHosts, writeHostsFile } from './hosts-file.js';`.
7. Both touched production files are under the size cap before the change:
   `src/plugins/hosts/hosts-file.ts` has 166 lines and `src/plugins/hosts/ssh-intents.ts` has 98.

## Existing functionality

1. The filename constant the reader already uses for messages and decoding:
   `src/plugins/hosts/hosts-file.ts:7` `const FILE_NAME = 'hosts.json';`.
2. The `path.join` catalog spelling in the reader: `src/plugins/hosts/hosts-file.ts:88`
   `const homePath = path.join(home, '.janissary', FILE_NAME);`.
3. The project-first, home-fallback selection logic: `src/plugins/hosts/hosts-file.ts:91`
   `if (root !== '') {` followed by the `if (effective === undefined) {` block at `:97`.
4. The guard's canonical comparison through real paths: `src/plugins/hosts/ssh-intents.ts:39`
   `const resolved = realPath(targetPath);`.
5. The existing refusal tests that pin both catalog targets: `src/plugins/hosts/activate.test.ts:421`
   `it('refuses an export aimed at the home catalog without touching either catalog', () => {`.
6. The existing hosts spec section for the refusal: `product/specs/hosts-tab.md:95`
   `### Catalog files are not ssh configs`.

## Implementation steps

Every step ends green under `$janissary/scripts/run.mjs check-diff`, which is each step's build command.

1. In `src/plugins/hosts/hosts-file.ts`, add an exported `catalogPaths(root, home)` helper above
   `readHostsFile`. It returns `{ project?: string; home: string }`, building both locations with
   `path.join(base, '.janissary', FILE_NAME)` and omitting `project` when `root === ''`. Import
   nothing and add no comments. Build with `$janissary/scripts/run.mjs check-diff`.
2. In `readHostsFile`, take the paths from `catalogPaths(root, home)` instead of the two local
   `path.join` calls. Keep the `if (root !== '')` decision expressed through the presence of the
   project path, leave the consultation order, effective selection, problem collection, notification
   and fallback report path otherwise unchanged. Build with `$janissary/scripts/run.mjs check-diff`.
3. In `src/plugins/hosts/ssh-intents.ts`, import `catalogPaths` from `./hosts-file.js` on the existing
   import line and use its paths in `isCatalogPath` in place of the two literal `path.join` calls,
   filtering out the absent project path when the root is empty. Leave `realPath`, the `some`
   comparison, `targetOf`, `runSshIntent` and every refusal message untouched. Build with
   `$janissary/scripts/run.mjs check-diff`.
4. Add the drift-detection tests described under Tests to `src/plugins/hosts/hosts-file.test.ts`,
   importing `catalogPaths` on the existing module import line. Leave all existing cases in that file
   and in `activate.test.ts`, `export-ssh.test.ts`, and `import-ssh.test.ts` unchanged. Build with
   `$janissary/scripts/run.mjs check-diff`.
5. Add one concise guarantee sentence about the shared definition to the existing
   `### Catalog files are not ssh configs` section of `product/specs/hosts-tab.md`. Change no other
   spec, no help page, and neither documentation tree. Build with `$janissary/scripts/run.mjs
   check-diff`.

## UI design

1. No user interface surface changes. No command, flag, key binding, dialog, or component is added or
   changed; the refusal and its wording are already in place and stay as they are.

## Tests

Extend `src/plugins/hosts/hosts-file.test.ts` in the existing fixture style (`directories`,
`writeJson`, `homeFile`, `projectFile`, `expect(...).toBe(...)`) with a describe block for the shared
definition:

- A project-only fixture writes a catalog under the project and none under the home directory;
  `readHostsFile(root, home).path` equals `catalogPaths(root, home).project`, proving the reader
  consults the helper's project path (Requirement 5).
- A home-only fixture writes a catalog under the home directory and none under the project;
  `readHostsFile(root, home).path` equals `catalogPaths(root, home).home`, proving the reader
  consults the helper's home path (Requirement 6).
- With an empty root, the helper has no `project` entry and still has the home path (Requirement 2).

Keep the existing refusal, successful import and export, and target read and write failure cases in
`activate.test.ts`, `export-ssh.test.ts`, and `import-ssh.test.ts` byte for byte unchanged
(Preserved behavior 3 to 5).

## Out of scope

- No change to the `FILE_NAME` value, the `.janissary` directory name, or any catalog location.
- No change to refusal wording, import or export behavior, target resolution, or realpath handling.
- No new module, no new type exported beyond the helper's return shape, and no comments.
- No edits to `help/`, `documentation/user-documentation/`, or `documentation/developer-documentation/`.
- No change to the PR title or description, and no new backlog entry.

## Verification

Run `$janissary/scripts/run.mjs check-diff`; lint, typecheck, and both test projects must pass,
including the unchanged refusal, import, export, and read/write failure cases.

Then run `npx vitest run --project server src/plugins/hosts/hosts-file.test.ts
src/plugins/hosts/activate.test.ts` and read the results: the two new fixtures pass alongside every
existing case, and the guard cases still refuse both catalogs. A failure looks like a reported path
that no longer matches the helper, or a formerly refused catalog export now reaching a write.

As the reader-performable check, read `src/plugins/hosts/hosts-file.ts` and
`src/plugins/hosts/ssh-intents.ts` together: confirm the catalog paths are constructed only inside
`catalogPaths` from `FILE_NAME`, that `readHostsFile` and `isCatalogPath` both consume that helper,
and that no literal `.janissary`/`hosts.json` path pair remains in the guard. A second construction
site or an untouched literal in the guard means the change was not made correctly.
