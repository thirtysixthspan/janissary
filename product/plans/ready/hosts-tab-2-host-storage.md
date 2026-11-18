# Select and persist the effective hosts file

**Complexity: 4/10** — ~100 added lines, 8 requirements and 13 scenarios (p=5.14)

## Goal

Work unit 2 of [Hosts Tab](../complete/hosts-tab.md). Select the effective file for both lookup and writes, and give interactive callers a shared way to report file problems. Depends on [Validate saved host records](../ready/hosts-tab-1-host-decoding.md).

## Implementation

- **Storage (feature text).** Host configurations are stored in `~/.janissary/hosts.json`, overridden by the project's `.janissary/hosts.json`, "similar to how other configuration files are managed". The existing precedent for that pairing is whole-file replacement: a valid project `.janissary/commands.json` or `.janissary/roles.json` replaces the home file entirely (`product/specs/application-commands.md`, `product/specs/roles.md`).
- **Whole-file override (user decision).** Exactly like `commands.json` and `roles.json`: when a project `.janissary/hosts.json` is in effect it replaces `~/.janissary/hosts.json` entirely; the two are never merged. Name uniqueness is checked within the file in effect.
- **Save target (user decision).** A host created in the modal is written to the file in effect: the project file when one is in effect, otherwise the home file, which the first save creates. Writes are atomic and preserve every other entry.

- **Malformed project file falls back (user decision).** A project `.janissary/hosts.json` that is unusable does not take effect: the home file is in effect instead (listed, resolvable, and the save target), and a notification reports the bad project file. When the home file is the one in effect and it is unusable, the list is empty, no saved name resolves, and saving is refused.
- **Malformed-file notification (user decision).** `Hosts file <path> is unusable: <problem>.` is posted once per distinct problem — the first read that finds a given file and problem text posts it, and later reads stay quiet until the problem changes, or is fixed and later reappears.

- Add `readHostsFile(root, home)` in `src/plugins/hosts/hosts-file.ts`. Follow the path selection in `src/plugins/roles/roles-file.ts:180` (`readRolesFile`), keeping the hosts-specific fallback. Return the decoded hosts, effective path, whether the effective file is usable, and problems keyed by path. If a valid project file exists, stop there, even if its catalog is empty. Otherwise evaluate home. An absent home file yields an empty usable catalog with the home path as the write target. An unusable home file yields an empty unusable catalog with that same path. A failed project read contributes its problem in either case. When the project and home paths are identical, evaluate the file once as the effective file.
- Classify absent candidates before using `src/plugins/files.ts:105` (`readJsonConfigFile`), which reports both unreadable files and invalid JSON as problems. Return the host decoder's structured result from the decode callback so its specific validation problem survives alongside the helper's read and JSON errors. Normalize the reason to a single line without terminal punctuation before applying the notification format above. Reads never create directories or files.
- `serializeHosts(hosts)` produces 2-space-indented JSON from a name-keyed object built from sorted records. Preserve names that overlap JavaScript object properties as own keys. Rebuild `destination` as `host[:port]`; omit absent optional fields. `hosts list` uses the serializer directly. `writeHostsFile(path, hosts)` writes the same content plus a trailing newline through `src/plugins/files.ts:88` (`writeJsonConfigFile`), creating the parent directory and returning success or failure like `src/plugins/roles/roles-file.ts:219` (`writeRolesFile`). Each later mutation re-reads immediately before deciding and writing, keeps that sequence synchronous, preserves unrelated entries and refuses to write if the fresh effective file is unusable.
- Track reported problems process-wide with a module-level `Set` keyed by path and reason. When a path is observed with a different reason, clear its old key. A usable or absent observation also clears reported keys for that path. Interactive callers consume and report newly observed problems through their existing notification mechanism. A silent read for completion leaves unresolved problems eligible for the next interactive report and still clears stale entries as files recover. Paths that were skipped, such as home behind a valid project file, retain their previous memo state until read again.
- Document file location, override, fallback and first save in `product/specs/state-directory.md`.

## Tests

Extend `src/plugins/hosts/hosts-file.test.ts` to cover valid and empty project override, malformed and unreadable project fallback, a missing or unusable home file, coincident paths, deterministic JSON with optional and object-property names, and atomic write round trip and failure. Exercise repeated identical problems, a changed reason, a fix followed by recurrence and a silent read followed by an interactive report.

## Out of scope

Commands, intents and file watching.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Break a scratch project file and check that home is selected and a write leaves the project bytes intact.
