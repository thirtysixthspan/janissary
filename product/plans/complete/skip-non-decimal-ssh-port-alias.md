# Skip ssh aliases whose effective Port is not plain decimal

**Complexity: 3/10** — 3 production lines in 1 file, 8 requirements, 5 scenarios (p=4.39)

## Goal

Restore the import rule that an alias the saved-host rules cannot express is skipped and counted. Today `acceptedHost` converts an alias's `Port` text with `Number` before validation, so `Port 1e2` and `Port 0x10` become the valid numbers 100 and 16 and are imported with a port the user never wrote. The feature plan requires that a port failing the saved-host rules be skipped ("Skip both, import rest") while an imported host keeps "the alias's effective `User` and `Port`"; the functional spec states an alias whose settings cannot be expressed as a saved host is skipped. After this fix such an alias is skipped like any other invalid record, the plain-decimal path is unchanged, and the summary still reports the skip.

## Requirements

1. An alias with a non-empty `Port` whose text is not plain decimal is skipped by `acceptedHost` before a destination is built ("An alias whose name, user, host, or port fails the saved-host rules ... is skipped").
2. A non-empty port is accepted only when its text matches `/^[0-9]+$/`.
3. A plain-decimal port still passes through the existing `Number` conversion, so an imported host's port remains "the alias's effective `User` and `Port`" for that case.
4. A legitimate leading-zero decimal port such as `0222` is accepted and stored as the number `222`, not rejected.
5. A skipped odd-port alias increments the skipped count the same way every other invalid record does.
6. With an ordinary alias and one carrying `Port 1e2`, the ordinary host is written in the single catalog write, the odd-port alias is absent, and the skipped count is incremented to 1.
7. The summary for that case carries `; skipped 1.` before the period.
8. `validateHostFields` and `splitDestination` are unchanged, and the existing `Port abc`, bracketed-alias, and singular and plural summary cases keep passing untouched.

## Design decisions

- Reject the non-decimal port text at the point of premature conversion in `acceptedHost` rather than broadening or changing the saved-host validator, which already applies the digits-only rule to the destination text it receives.
- Use a `/^[0-9]+$/` guard against the raw `alias.port` string before `formatDestination`, so `1e2` and `0x10` fail while `222` and `0222` pass.
- Leave the existing `alias.port === '' ? ... : { ..., port: Number(alias.port) }` branch intact; the guard is an early return ahead of it, not a replacement for it.
- Treat a skipped odd-port alias as an ordinary skip so the existing `host === undefined` count and `importSummary` clause apply with no new counting path.
- Keep the fix inside `src/plugins/hosts/import-ssh.ts`; the validation helpers in `src/plugins/hosts/hosts-values.ts` need no change because the defect is the conversion before they run.
- No command, flag, or key binding changes, so no `help/` page is edited, and no `documentation/user-documentation/` or `documentation/developer-documentation/` page is edited.
- The named work item is the sole remaining entry in this branch's backlog, so that entry is removed on resolution and no description correction is required.

## Preserved behavior

1. Import writes every accepted alias in one catalog write and counts each skip. The new guard must not add a second write or drop the count. Pinned by `src/plugins/hosts/import-ssh.test.ts` › `adds the importable aliases in one write and leaves a clashing saved host unchanged`.
2. An alias with `Port abc` stays skipped and counted. The new guard must not change that case or make it importable. Pinned by `src/plugins/hosts/import-ssh.test.ts` › `skips clashing, invalid, and token-invalid aliases and preserves the rest`.
3. A bracketed alias whose name fails the saved-host rules stays skipped with no row written. The new guard must not alter that path. Pinned by `src/plugins/hosts/import-ssh.test.ts` › `skips a bracketed alias whose name fails the saved-host rules`.
4. The singular and plural summary wording with the `; skipped N` clause stays exactly as it is. The new guard must not reword `importSummary`. Pinned by `src/plugins/hosts/import-ssh.test.ts` › `reports several hosts in the plural with the skipped clause`.

## Assumptions

1. `alias.port` is always a string, empty when the alias has no `Port`: `src/plugins/hosts/ssh-config/parse.ts:82` `port: string;`.
2. Saved-host ports are digits only, from 1 to 65535: `src/plugins/hosts/hosts-values.ts:16` `const PORT_PATTERN = /^[0-9]+$/;`.
3. The premature conversion is at `src/plugins/hosts/import-ssh.ts:21` `port: Number(alias.port)`, where `1e2` becomes 100 and `0x10` becomes 16 before validation reads the destination.
4. The skip count already exists at `src/plugins/hosts/import-ssh.ts:56` `if (host === undefined) skipped++;`.
5. `src/plugins/hosts/hosts-values.ts:50` `if (!PORT_PATTERN.test(portText))` already rejects non-decimal text that reaches `splitDestination`; the defect is upstream of it.
6. The named work item is the first and only entry in `product/backlog/pull-request.md`, so that entry is removed on resolution and the file is restored to its comment-and-heading skeleton.

## Existing functionality

1. `formatDestination` builds the `host:port` destination from a saved host: `src/plugins/hosts/hosts-values.ts:86` `export function formatDestination(`.
2. `validateHostFields` validates name, user, destination and path: `src/plugins/hosts/hosts-values.ts:60` `export function validateHostFields(`.
3. `splitDestination` enforces the digits-only, in-range port rule on destination text: `src/plugins/hosts/hosts-values.ts:42` `function splitDestination(`.
4. `importSummary` appends the `; skipped N` clause: `src/plugins/hosts/import-ssh.ts:32` `function importSummary(`.
5. `readEffectiveAliases` supplies each alias with a string port: `src/plugins/hosts/ssh-config/parse.ts:182` `export function readEffectiveAliases(`.

## Implementation steps

1. In `src/plugins/hosts/import-ssh.ts`, inside `acceptedHost` after the `invalidToken` and clash guards and before the `formatDestination` call, add an early return of `undefined` when `alias.port !== ''` and the port text fails a `/^[0-9]+$/` test. Leave the existing conditional `Number(alias.port)` branch byte for byte so a plain-decimal port, including a leading-zero one, is still converted. Add no comments. Build and check with `$janissary/scripts/run.mjs check-diff`.
2. Add the two colocated cases in `src/plugins/hosts/import-ssh.test.ts` described under Tests, using the file's existing temp-directory helpers and mocked writes. Build and check with `$janissary/scripts/run.mjs check-diff`.
3. Update `product/specs/hosts-tab.md` § Importing and exporting with a concise statement that an alias whose `Port` text is not plain decimal is skipped and counted. Build and check with `$janissary/scripts/run.mjs check-diff`.
4. Move this plan from `./product/plans/ready/` to `./product/plans/complete/` and remove the resolved entry from `./product/backlog/pull-request.md`, restoring the comment-and-heading skeleton. Build and check with `$janissary/scripts/run.mjs check-diff`.
5. Commit and push to the existing head branch; verify the pull request stays open on that head. No description correction is required.

## UI design

None. No user interface surface is added or changed: the Import button, its label, its placement, and its empty-state visibility are untouched.

## Tests

- `src/plugins/hosts/import-ssh.test.ts`: one new case (Requirements 5 to 7) feeds one ordinary alias and one carrying `Port 1e2`, and asserts the ordinary host is written, the odd-port alias is absent, the skipped count is 1, and the summary carries `; skipped 1.`.
- `src/plugins/hosts/import-ssh.test.ts`: one new case (Requirements 2 to 4) pairs an alias carrying `Port 0x10` with one carrying a leading-zero decimal `Port 0222`, and asserts the hex-port alias is absent, the leading-zero alias is imported with port 222, and the skipped count is 1.
- Requirements 1 and 8's unchanged paths stay covered by the existing `Port abc`, bracketed-alias, and singular and plural summary cases; none of them is edited.

## Out of scope

- Changing `validateHostFields`, `splitDestination`, `PORT_PATTERN`, or the set of accepted saved-host ports.
- Editing any other file in `src/plugins/hosts/` or `src/plugins/hosts/ssh-config/`.
- Editing `documentation/user-documentation/`, `documentation/developer-documentation/`, or any `help/` page.
- Changing the pull request title or its description.
- Merging, closing, or replacing the pull request, or force-pushing its branch.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then perform this end-to-end check against the running app. Create a config with `Host web1` / `HostName web1.example` / `Port 2222` and `Host odd` / `HostName odd.example` / `Port 1e2`, start the app, open `hosts`, and press Import (equivalently run `hosts import <file>`). The notification should read `Imported 1 host from <path>; skipped 1.`, `web1` should appear with destination `web1.example:2222`, and no `odd` row should appear. A failure is an `odd` row with port 100, a changed skip count, or a reworded summary. Repeating with `Port 0222` should import that host with port 222 and no skip, so a refusal of the leading-zero alias would also be a failure.
