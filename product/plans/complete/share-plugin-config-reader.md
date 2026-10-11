# Share the config-file reader between the launcher and roles plugins

**Complexity: 3/10** — one small exported reader added to the plugin-reachable `files.ts`, and both plugin readers rewritten to call it while keeping their distinct fallback logic and exact problem wording; all existing tests keep passing.

## Goal

`src/plugins/roles/roles-file.ts` repeats the read-parse-decode core of `src/plugins/launcher/commands-file.ts`: the same `readFileSync` guarded into a "could not be read at" line, the same `JSON.parse` guarded into an "is not valid JSON at" line, and the same call into a per-caller decoder. Only the fallback policy differs — the launcher answers defaults when a file is unusable, while roles falls back along a chain — and that policy stays per-caller. This fix extracts the shared core once.

## Approach

The plugin import boundary (enforced in `eslint.plugin-boundaries.mjs`) opens exactly three host modules to a concrete plugin: `../api.js`, `../files.js`, and the two opener helpers. A new `src/plugins/config-file.ts` would **not** be reachable from a plugin, so the review finding's claim that a new module is reachable without touching the boundary is wrong. The correct home is `src/plugins/files.ts`, the one host file module the boundary already admits and that both the host and plugins reach; the shared reader is a file operation two file-backed plugins compose, which is that module's stated purpose. Adding it there needs no boundary change and no eslint-rule edit.

## Implementation

1. **`src/plugins/files.ts`** — add an exported `readJsonConfigFile<T>(filePath, fileName, decode, unusable)`. It reads the file; a read failure answers the canned problem `${fileName} could not be read at ${filePath}`; a parse failure answers `${fileName} is not valid JSON at ${filePath}`; otherwise it runs `decode(parsed)`, and when that answers `undefined` it answers the caller-supplied `unusable` wording as `${fileName} ${unusable} at ${filePath}`, otherwise the decoded value. Add a comment saying it exists because the launcher and roles readers share this core and because the boundary makes this module the one they may both reach.
2. **`src/plugins/roles/roles-file.ts`** — replace its `readAt`'s hand-rolled read/parse/not-a-set-of-roles branches with one `readJsonConfigFile(filePath, FILE_NAME, decodeRoles, 'is not a set of roles')` call, keeping the `decodeRoles`-returns-undefined → wrong-shape, partial-drop → problem-line, and the rest of the chain-walking logic exactly as it is. Drop the now-unused `readFileSync`/`JSON.parse` imports.
3. **`src/plugins/launcher/commands-file.ts`** — replace its inline read/parse/not-an-array handling inside `readLauncherFile` with one `readJsonConfigFile(filePath, 'launcher.json', arrayDecoder, 'is not a list of commands')` call, keeping `resolveSource`, the empty-array-means-default rule, and `fileProblem` unchanged so every existing problem string is byte-identical.

No caller signature changes: `readRolesFile(home, root)` and `readLauncherFile(home, root)` keep their signatures and their exact returned problem strings, so their existing tests pass unchanged.

## Tests

Existing suites that must keep passing unchanged:

- `src/plugins/roles/roles-file.test.ts` — every problem string and chain case.
- `src/plugins/launcher/commands-file.test.ts` — every problem string and default case.
- `src/plugins/roles/activate.test.ts` — the edit refusals that depend on the problem-bearing read.

New:

- `src/plugins/files.test.ts` — the shared reader answers each of its four outcomes directly: a read failure, a parse failure, a decoder that answers `undefined` (with the caller's wording), and a decoded value, each carrying the exact problem or value expected.

## Out of scope

- Unifying the two plugins' different fallback policies — the launcher answers defaults on an unusable file, roles falls back along a chain; each stays as it is.
- Changing any problem string's wording.
- Widening the plugin import boundary in `eslint.plugin-boundaries.mjs`, or creating a new host module a plugin may not reach.
- Adding config-file support to any other plugin.