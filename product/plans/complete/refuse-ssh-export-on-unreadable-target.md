# Refuse ssh export when the target config cannot be read
**Complexity: 2/10** — ~4 added lines in one production file, 5 requirements and 5 scenarios (p=4.15)

## Goal

Stop `exportSshHosts` from destroying an existing ssh config whose contents it could not read. The read of the target currently reports a problem for a file over the size limit and for other read failures, but the export ignores that result and splices the managed section into empty text, replacing the whole file and silently losing every manual host block. The export must refuse such a target before any write, leaving the file byte for byte unchanged, while still creating a genuinely missing target as a new file.

## Requirements

1. "when `read.problem` is set and is not `no such file`, return `{ ok: false, error: ... }`" — a target whose read failed is refused rather than written.
2. "naming the display path and the problem word" — the refusal message carries both the caller's display path and the exact problem word from the read.
3. "only `no such file` continues with empty text as a new file" — a missing target still gets a freshly created managed section.
4. "an oversized or unreadable config is no longer replaced with an empty managed section" — a refused export leaves the target's existing bytes untouched.
5. "mirroring the read guard already in `src/plugins/hosts/import-ssh.ts`" — the refusal uses the same message shape and the same problem-word wording as import's read guard.

## Design decisions

- Put the guard immediately after `readSshConfigFile(targetPath)` returns, before any parsing, counting, serialization or write, so a problem can never reach `writeSshConfigFile` (Requirements 1 and 4).
- Treat `no such file` as the only acceptable problem: that is the new-file case and continues with the empty `read.text` exactly as today; every other problem word refuses (Requirement 3).
- Mirror import's read guard verbatim — `Cannot read ssh config <display path>: <problem>.` — rather than inventing an export-specific message, keeping the display path and problem word visible to the caller (Requirements 2 and 5).
- Keep the unusable-catalog check, with its forwarded notify, ahead of the read, so moving the read guard does not move that notification or its ordering (Preserved behavior 1).
- Change only `export-ssh.ts` in production code; the read limit and problem words in `ssh-config-file.ts` already describe the failure and need no edit.

## Preserved behavior

1. An unusable hosts catalog is still refused before the target is read, and still forwards the hosts-file notice to `notify`; the new guard must not move that check below the read or swallow the notification. Pinned by `src/plugins/hosts/export-ssh.test.ts` › `exportSshHosts > refuses an unusable catalog, notifies, and leaves the target byte for byte unchanged`.
2. A missing target is still created with a fresh managed section and the same report; the `no such file` problem must not be treated as a refusal. Pinned by `src/plugins/hosts/export-ssh.test.ts` › `exportSshHosts > creates a missing target with the managed section`.
3. A write failure is still reported with `Could not write ssh config <display path>: <problem>.` and leaves the existing bytes in place; the new read guard must not change that path or its wording. Pinned by `src/plugins/hosts/export-ssh.test.ts` › `exportSshHosts > reports a mocked write failure with the display path and the problem word`.
4. A readable target still mirrors the catalog into the managed section, dropping outside aliases and rewriting changed values; the guard must not alter the happy path. Pinned by `src/plugins/hosts/export-ssh.test.ts` › `exportSshHosts > mirrors the catalog into the section, dropping orphans and overwriting changed values without a path`.

## Assumptions

1. `readSshConfigFile` reports an over-limit file and other failures through `problem` while returning empty text: `src/plugins/hosts/ssh-config-file.ts:23` `if (statSync(filePath).size > MAX_BYTES) return { text: '', problem: 'file is too large' };`.
2. `no such file` is a distinct, expected problem word: `src/plugins/hosts/ssh-config-file.ts:14` `if (error.code === 'ENOENT') return 'no such file';`.
3. Import's read guard supplies the message shape to mirror: `src/plugins/hosts/import-ssh.ts:47` `return { ok: false, error: \`Cannot read ssh config ${displayPath}: ${read.problem}.\`; };`.
4. The export's failure contract is a union of an error string and a report: `src/plugins/hosts/export-ssh.ts:9` `| { ok: false; error: string }`.
5. The unusable-catalog check and its notify run before the read today: `src/plugins/hosts/export-ssh.ts:31` `if (!catalog.usable) {`.
6. Colocated Vitest files are the server test convention: `src/plugins/hosts/export-ssh.test.ts:1` `import { afterEach, describe, expect, it, vi } from 'vitest';`.

## Existing functionality

1. The read-result shape carrying `text` and an optional `problem`: `src/plugins/hosts/ssh-config-file.ts:9` `type ReadResult = { text: string; problem?: string };`.
2. The read guard to mirror in import: `src/plugins/hosts/import-ssh.ts:46` `if (read.problem !== undefined) {`.
3. The target read call site in export that currently ignores the problem: `src/plugins/hosts/export-ssh.ts:34` `const read = readSshConfigFile(targetPath);`.
4. The write guard whose message shape and unchanged-bytes behavior stay in place: `src/plugins/hosts/export-ssh.ts:44` `if (written.problem !== undefined) {`.
5. The colocated export suite to extend: `src/plugins/hosts/export-ssh.test.ts:51` `describe('exportSshHosts', () => {`.
6. The existing real-read size-limit case that pins the problem word: `src/plugins/hosts/ssh-config-file.test.ts:40` `it('reports file is too large for a file over 1 MiB', () => {`.

## Implementation steps

Every step ends green under `$janissary/scripts/run.mjs check-diff`, which is each step's build command.

1. In `src/plugins/hosts/export-ssh.ts`, add a guard directly after the `readSshConfigFile(targetPath)` call: when `read.problem` is defined and is not `no such file`, return the failure outcome with `Cannot read ssh config <display path>: <problem>.` built from the existing `displayPath` parameter and `read.problem`. Leave the unusable-catalog check and its notify above the read, and leave all code after the read untouched, so `no such file` still falls through with the empty `read.text`. No new helper, type or module is introduced. Build with `$janissary/scripts/run.mjs check-diff`.
2. In `product/specs/hosts-tab.md`, add a concise subsection describing that an export to a target the app cannot read is refused, names the display path and problem in the refusal, leaves the target untouched, and still creates a genuinely missing target. State the behavior in user-visible prose with no code or file paths. Build with `$janissary/scripts/run.mjs check-diff`.
3. Read the two diffs once to confirm the guard sits before any write, that the successful and write-failure paths are byte for byte unchanged, and that the spec text matches the behavior. Build with `$janissary/scripts/run.mjs check-diff`.

## UI design

1. No user interface surface changes. The refusal is returned as the operation's error result for the caller to display; this branch has no export command verbs or buttons yet, so no command, flag, key binding, dialog or client component is added or changed.

## Tests

Add one case to `src/plugins/hosts/export-ssh.test.ts`, tied to Requirements 1, 2 and 4:

- Write a real target config larger than the 1 MiB read limit that contains manual host blocks, then call `exportSshHosts` with the real `readSshConfigFile` (do not mock the read). Assert the result is the refusal `Cannot read ssh config ~/.ssh/config: file is too large.` and that the target's bytes are identical to before the call. Cover both the refusal and the unchanged-target assertion in this single case.

Leave these neighboring cases byte for byte unchanged, since they pin Preserved behavior 1 to 4: the real-read size-limit case in `src/plugins/hosts/ssh-config-file.test.ts` (`reports file is too large for a file over 1 MiB`), and the mocked write-failure case, the missing-target case, the unusable-catalog case and the happy-path case in `src/plugins/hosts/export-ssh.test.ts`.

## Out of scope

- No change to `readSshConfigFile`, its size limit, or its problem words.
- No change to import, the managed-section serializer/splicer, or the write path.
- No new command verbs, intents, buttons, flags or key bindings — those belong to other plans not yet on this branch.
- No edit to `help/`, `documentation/user-documentation/` or `documentation/developer-documentation/`.
- No change to any other spec file or plan.

## Verification

Run `$janissary/scripts/run.mjs check-diff`; lint, typecheck and both test projects must pass.

Then run `npx vitest run --project server src/plugins/hosts/export-ssh.test.ts` and read the new case. Confirm it writes a config over the read-size limit with manual host blocks, calls `exportSshHosts` against the real read, receives `Cannot read ssh config ~/.ssh/config: file is too large.`, and leaves the target byte for byte unchanged; a failure looks like a successful `Exported …` report or a target reduced to only the managed section. As a second performable check, read `src/plugins/hosts/export-ssh.ts` and `src/plugins/hosts/import-ssh.ts` together and confirm the new guard sits between the target read and the managed-section parse, that only `no such file` falls through, and that the refusal message matches import's read guard; a guard below `findManagedSections` or a changed import guard means the change was not made correctly.
