<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Close the security gap where a dangling symlink to a saved-hosts catalog bypasses the export guard.

Existing Issue: The runner's catalog guard resolves operands with `realpathSync` and falls back to `path.resolve` when the link target is missing, while the writer resolves a dangling link with `readlinkSync` and writes through to the file it names, so a link whose text points at a catalog passes the guard and the export writes into that catalog file. Severity: 9/10

Existing Risk: 8/10 - An export through such a link can create or replace a project catalog with ssh-config text, which then shadows a usable home catalog and makes every saved host appear to vanish.

Proposal Risk: 2/10 - Once the guard resolves dangling links, the catalog is refused before any read or write and only the intended write-through to an ordinary config link remains.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2242 "refuse export through a dangling symlink that resolves to a saved-hosts catalog". In `src/plugins/hosts/ssh-intents.ts`, extend `realPath` so that when `realpathSync` fails with `ENOENT` on a symbolic link it reads the link with `readlinkSync`, resolves the text against `path.dirname(filePath)`, and repeats resolution with a bounded loop before comparing against `catalogPaths`; keep the plain `path.resolve` fallback for a missing non-link path. Resolve both the operand and each catalog path through that helper so a link naming a not-yet-created catalog is refused too. Add a case to `src/plugins/hosts/activate.test.ts` that creates a dangling link under the home directory naming the project catalog, seeds saved hosts in the home catalog, runs `hosts export <link>`, and asserts the catalog refusal, both catalogs byte-for-byte unchanged, and no write; mirror it for `hosts import <link>` and add a control case with a dangling link to a non-catalog path that still executes. Requirement 62 of the feature plan, `product/specs/hosts-tab.md` § Catalog files are not ssh configs, and the description's claim that neither catalog can be an operand already state this behavior, so no prose edit is needed. The live-symlink catalog case in `src/plugins/hosts/activate.test.ts` and the dangling-symlink write-through case in `src/plugins/hosts/ssh-config-file.test.ts` must keep passing untouched; the hazard to watch is refusing an ordinary dangling config link, which the control case pins.


* Handle the functionality gap where a non-decimal ssh Port is silently converted instead of skipped.

Existing Issue: `acceptedHost` in `src/plugins/hosts/import-ssh.ts` passes `Number(alias.port)` into `formatDestination` before `validateHostFields` sees the value, so an alias such as `Port 1e2` or `Port 0x10` becomes a valid numeric port instead of being rejected as a value that cannot be expressed as a saved host. Severity: 4/10

Existing Risk: 4/10 - An alias the saved-host rules should skip is imported with a port the user never wrote, so launching it reaches a different service than the ssh config specified.

Proposal Risk: 2/10 - After a decimal-only guard the alias is skipped and counted like every other invalid record, while the plain-decimal path is unchanged.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2242 "skip ssh aliases whose effective Port is not plain decimal". In `src/plugins/hosts/import-ssh.ts`, before building the destination in `acceptedHost`, return `undefined` when `alias.port !== ''` and the value fails a `/^[0-9]+$/` test, leaving the existing `Number` conversion in place for accepted decimal values; `validateHostFields` and `splitDestination` in `src/plugins/hosts/hosts-values.ts` already reject non-decimal and out-of-range ports, so they need no change. Add a case to `src/plugins/hosts/import-ssh.test.ts` with one ordinary alias and one carrying `Port 1e2` (and, if useful, `Port 0x10`), asserting the ordinary host is written, the odd-port alias is absent, the skipped count is incremented, and the summary carries the `; skipped 1.` clause. Requirements 15 and 18 of the feature plan and the spec statement that aliases which cannot be expressed as saved hosts are skipped define the behavior being restored. The existing `Port abc` case, the bracketed-alias case, and the singular and plural summary cases must keep passing untouched; the hazard to watch is rejecting a legitimate leading-zero decimal port, which a colocated decimal case should pin.
