# Select and write the effective hosts file

**Complexity: 5/10** — ~134 added production lines, 8 requirements and 17 scenarios (p=5.310)

## Goal

Expose the plugin-owned catalog to the plugin and core callers and preserve valid entries on writes. Source plan: `product/plans/complete/hosts-tab.md`. Depends on `product/plans/ready/hosts-tab-1-catalog-values.md`.

## Implementation

In `src/plugins/hosts/hosts-file.ts`, expose `readHostsFile(root, home)` with the decoded hosts, path in effect, usability, and separate `{ path, problem }` entries for all unusable files consulted. Try `<root>/.janissary/hosts.json` first when there is a project root. A usable project file wins as a whole, including an empty object. Consult `<home>/.janissary/hosts.json` when the project candidate is absent or unusable. An absent home file yields an empty usable catalog and the future home write path. An unreadable or undecodable home file yields an empty unusable catalog and its path. Follow the selection shape of `src/plugins/roles/roles-file.ts:180` (`readRolesFile`), with first creation deferred to a successful mutation.

Classify a missing path separately from an unreadable one before delegating reads to `src/plugins/files.ts:105` (`readJsonConfigFile` via `../files.js`). Use a filesystem probe that distinguishes `ENOENT` from a permissions or path-component error. An existing directory at the config path and a failed read are unusable. On a successful JSON parse, pass the validation result, including its specific diagnostic, through the helper's generic value so callers can distinguish validation from read or parse failure. Use stable one-line reasons for each type of failure and keep the file path in the outer notification.

Track the latest reported problem text per file in process memory. Commands, intents and launch executors pass a notification callback to `readHostsFile`. Report `Hosts file <path> is unusable: <problem>.` for each consulted path when its problem text changes or a previously fixed problem returns. A successful or missing consulted file clears its entry, and an unconsulted home file retains its memo. The completion caller omits the callback, making the read leave the memo untouched, including after a quiet successful read.

Use one `serializeHosts` for transcript output and file writes. Serialize an empty catalog as `{}`. For other catalogs, assemble the top-level members in the decoder's folded-name order, escaping each key and value with `JSON.stringify` and using two-space indentation. Follow the member-by-member formatting approach in `src/plugins/roles/ordered-json.ts:47` (`serializeRoles`) without importing from the roles plugin. Preserve numeric name order and ordinary keys such as `__proto__` without relying on object enumeration. Emit each entry's `destination` through the values formatter, include `user` and `path` when present, and preserve saved name spelling.

Provide a synchronous mutation entry point that selects the effective file again, reports fresh problems through the same callback, and refuses an unusable effective file with `Cannot save hosts: <path> is unusable — fix it by hand.` Apply the requested change to that fresh catalog. A business-rule refusal returns the caller's diagnostic and skips writing. A successful change uses `writeHostsFile(path, hosts)` to create the parent directory as needed and append one trailing newline to the serializer output. Use `src/plugins/files.ts:88` (`writeJsonConfigFile`) for atomic replacement. Its `atomicWriteFile` implementation at `src/atomic-write.ts:8` writes a temporary sibling and renames it, retaining the previous file if the write fails. A directory-creation or write failure returns `Could not write hosts.json at <path>.` Return the selected path and written catalog only after replacement succeeds, so callers can repaint from the resulting data.

## Tests and verification

Cover project selection, empty override, no project root, missing files and first creation, invalid project fallback, unreadable project fallback, malformed and unreadable home refusal, and two consulted problems in `src/plugins/hosts/hosts-file.test.ts`. Test notification repeat, change, observed recovery and recurrence, plus quiet reads that leave the memo unchanged. Test sorted round trip with numeric and special keys, a hand edit before mutation, a caller's mutation refusal, and a write failure that preserves the prior bytes and returns no replacement catalog. Document storage and precedence in `product/specs/state-directory.md`. Run `$janissary/scripts/run.mjs check-diff`. In scratch home and project directories, add a home host, write `{}` as the project override, then replace it with broken JSON and confirm reads select the home host and writes leave the invalid project bytes intact.

## Out of scope

Catalog operations and their command or intent responses.
