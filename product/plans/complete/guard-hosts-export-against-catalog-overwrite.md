# Guard hosts import and export against catalog files
**Complexity: 3/10** — ~22 added lines in one production file, 7 requirements, 5 scenarios, 3 new helpers (p=4.72)

## Goal

Stop the newly runnable `hosts export` from replacing a usable hosts catalog with an ssh-config section. The command runner now resolves an operand to an absolute path and calls `exportSshHosts` with no check that the target is one of the two `hosts.json` files that supplied the catalog, so `hosts export ~/.janissary/hosts.json` silently destroys every saved host while reporting a successful export. The same resolution lets a catalog be read as an ssh config during import, producing a misleading summary rather than a real import. One guard in the runner must refuse either verb before any read or write reaches the operations.

## Requirements

1. "compare the resolved absolute path with both catalog locations, `path.join(root, '.janissary', 'hosts.json')` and `path.join(home, '.janissary', 'hosts.json')`" — both catalog locations are treated as forbidden targets.
2. "resolving existing paths through `realpathSync` so a symlinked or `..`-spelled operand cannot slip past" — a symlink or `..` spelling that lands on a catalog is refused just like the plain path.
3. "on a match, use the existing `report` helper to refuse with a message naming the catalog and stating that an export cannot target it" — the refusal text names the catalog and says an export cannot target it.
4. "return without calling `exportSshHosts` or `writeSshConfigFile`" — a refused operand reaches neither the operation nor any write.
5. "Place the guard in the runner or in `exportSshHosts`, but not in both, so the rule has one owner for the command and the later intent caller alike." — exactly one guard covers both the command dispatch and the intent path.
6. "Apply the same comparison to the import path if its source can be a catalog file" — an import whose source is a catalog is refused with its own verb-specific message.
7. "asserting the exact refusal, that both catalog files are byte-for-byte unchanged, that the mocked `writeFileSync` was not called, and that no tab update or open happened" — the transport-level effect of a refusal is observable in the activation tests.

## Design decisions

- Put the guard in `runSshIntent` immediately after `targetOf`, ahead of the import branch, so the single runner owns the rule for the transcript command and for any later intent caller; do not add a second guard inside `exportSshHosts`, `importSshHosts` or `ssh-config-file.ts` (Requirement 5).
- Build both forbidden paths with the same `path.join(root | home, '.janissary', 'hosts.json')` spelling the catalog reader uses, so each file that can supply hosts is covered regardless of which one is in effect (Requirement 1).
- Resolve both the target and each catalog through `realpathSync`, with a `path.resolve` fallback for a path that does not exist yet, so symlinks and `..` cannot bypass the comparison and a not-yet-created catalog target is still refused (Requirement 2).
- Run the same predicate for import and export because one `targetOf` resolves the operand for both verbs, and give each verb its own clear message about the role the catalog cannot play (Requirements 3 and 6).
- Feed the refusal through the existing `report(..., true)` helper, which rejects a transcript command and notifies an intent, matching how the remote-tab refusal already behaves (Requirement 3).
- Leave the operation modules untouched so their target-read, target-write and catalog-failure contracts keep their current messages and ordering.

## Preserved behavior

1. A normal local export still reports `Exported ... to ~/.ssh/config.` without publishing or opening a tab; an ordinary ssh-config target must never match the guard. Pinned by `src/plugins/hosts/activate.test.ts` › `hosts activation ssh commands > notes a local export report without publishing or opening a tab`.
2. A normal local import still publishes the written catalog and never opens a tab; an ordinary ssh-config source must never match the guard. Pinned by `src/plugins/hosts/activate.test.ts` › `hosts activation ssh commands > notes a local import, publishes the written catalog, and never opens a tab`.
3. An unreadable or oversized export target is still refused with `Cannot read ssh config ...: ...` and its bytes left unchanged; the new guard must not replace that message or reorder that check. Pinned by `src/plugins/hosts/export-ssh.test.ts` › `exportSshHosts > refuses an oversized target with manual hosts and leaves its bytes unchanged`.
4. A failed export write still reports `Could not write ssh config ...: ...` and leaves the target untouched; the guard must not preempt that path. Pinned by `src/plugins/hosts/export-ssh.test.ts` › `exportSshHosts > reports a mocked write failure with the display path and the problem word`.
5. An unreadable import source is still refused with `Cannot read ssh config ...: no such file.` without consulting or writing the catalog. Pinned by `src/plugins/hosts/import-ssh.test.ts` › `importSshHosts > reports a source read failure without consulting or writing the catalog`.
6. A failed import catalog write still reports `Could not write hosts.json at ...` and preserves the prior bytes. Pinned by `src/plugins/hosts/import-ssh.test.ts` › `importSshHosts > reports a failed catalog write verbatim and preserves the prior bytes`.
7. Both verbs are still refused in a remote tab before any file is touched, ahead of the new path check. Pinned by `src/plugins/hosts/activate.test.ts` › `hosts activation ssh commands > refuses both verbs in a remote tab before touching any file`.

## Assumptions

1. `targetOf` always yields an absolute path for an explicit operand: `src/plugins/hosts/ssh-intents.ts:24` `resolveSshConfigTarget(`.
2. An operand left empty resolves to the ssh config, never a catalog: `src/plugins/hosts/ssh-intents.ts:16` `const DEFAULT_DISPLAY = '~/.ssh/config';`.
3. The catalog reader builds both paths with the same join used by the guard: `src/plugins/hosts/hosts-file.ts:88` `const homePath = path.join(home, '.janissary', FILE_NAME);`.
4. `report` already distinguishes command refusals from intent notifications: `src/plugins/hosts/ssh-intents.ts:37` `if (refusal) return capabilities.rejectRequest(text);`.
5. `realpathSync` is available from `node:fs` and is already used in this feature to follow symlinks: `src/plugins/hosts/ssh-config-file.ts:1` `import { lstatSync, mkdirSync, readFileSync, realpathSync, statSync } from 'node:fs';`.
6. `runSshIntent` is the only production caller of both operations: `src/plugins/hosts/activate.ts:60` `runSshIntent(parsed, capabilities, notify,`.
7. Colocated test files are exempt from the line-count guideline, so the cases can live beside the existing suite: `eslint.config.mjs:115` `files: ['**/*.test.ts', '**/*.test.tsx']`.

## Existing functionality

1. The refusal-aware `report` helper that both verbs already use: `src/plugins/hosts/ssh-intents.ts:29` `function report(`.
2. The operand resolver that produces the absolute target: `src/plugins/hosts/ssh-intents.ts:20` `function targetOf(`.
3. The `~`, `$root`, `$workspace`, `$HOME` and relative operand expansion that an attacker can spell a catalog with: `src/plugins/hosts/ssh-config-target.ts:16` `function expandOperand(`.
4. The two catalog locations the guard must protect: `src/plugins/hosts/hosts-file.ts:92` `const projectPath = path.join(root, '.janissary', FILE_NAME);`.
5. The existing local-tab refusal that models the message path: `src/plugins/hosts/ssh-intents.ts:15` `const REMOTE_REFUSAL =`.
6. The fixture and refusal helpers the new cases will reuse: `src/plugins/hosts/activate.test.ts:60` `function fixture()` and `:141` `function refusal(`.
7. The symlink-resolving precedent: `src/plugins/hosts/ssh-config-file.ts:36` `if (lstatSync(target).isSymbolicLink()) target = realpathSync(target);`.

## Implementation steps

Every step ends green under `$janissary/scripts/run.mjs check-diff`, which is each step's build command.

1. In `src/plugins/hosts/ssh-intents.ts`, import `realpathSync` from `node:fs`. Add a path-normalizing helper that returns `realpathSync` of a path and falls back to `path.resolve` when the path does not exist, and a predicate that compares the normalized target with the normalized `path.join(root, '.janissary', 'hosts.json')` and `path.join(home, '.janissary', 'hosts.json')`. Add a message builder that names the abbreviated display path and states that the verb cannot use the catalog as its target or source. Introduce no new module, class or exported type. Build with `$janissary/scripts/run.mjs check-diff`.
2. In `runSshIntent`, directly after `const target = targetOf(variant, root, cwd)`, call the predicate; on a match call `report(mode, capabilities, notify, message, true)` and return. Put this above the `variant.kind === 'import'` branch so one check governs both verbs, and make no edit to `export-ssh.ts`, `import-ssh.ts` or `ssh-config-file.ts`. Build with `$janissary/scripts/run.mjs check-diff`.
3. In `product/specs/hosts-tab.md`, extend the export section with concise user-visible prose stating that neither catalog can be an export target or an import source, that the refusal names the catalog, and that both catalog files and any ordinary config are left untouched. Keep it behavior-only, with no code or file paths. Build with `$janissary/scripts/run.mjs check-diff`.
4. Read both diffs once to confirm the guard sits in `runSshIntent` alone, that the remote-tab refusal still comes first, that no operation or file-access module changed, and that the spec text matches the behavior. Build with `$janissary/scripts/run.mjs check-diff`.

## UI design

1. The only user-visible surface is the existing command-transcript rejection and intent notification: a refused operand now shows `Cannot export hosts: ~/.janissary/hosts.json is the hosts catalog and cannot be an export target.` (or the matching import wording) instead of an export summary.
2. No button, dialog, key binding, layout or tab behavior changes; the Hosts tab is neither updated nor opened by a refusal.

## Tests

Add cases to the `hosts activation ssh commands` block in `src/plugins/hosts/activate.test.ts`, using the existing `fixture`, `writeCatalog`, `writeText`, `refusal` and mocked `writeFileSync` helpers:

- `hosts export ~/.janissary/hosts.json` with usable home and project catalogs, tied to Requirements 1, 3 and 7: assert the exact refusal naming `~/.janissary/hosts.json`, both catalog files byte for byte unchanged, `writeFileSync` not called, and no tab update or open event.
- `hosts export $root/.janissary/hosts.json` with the same fixtures, tied to Requirements 1 and 7: assert the exact refusal naming `$root/.janissary/hosts.json` and the same no-write, no-tab assertions.
- `hosts export ~/.janissary/../.janissary/hosts.json`, tied to Requirement 2: assert the same refusal as the plain home operand, proving a `..` spelling cannot bypass the comparison.
- A symlink in the home directory pointing at the home catalog used as `hosts export ~/aliased.json`, tied to Requirement 2: assert the refusal and unchanged bytes, proving `realpathSync` catches a symlinked spelling.
- `hosts import ~/.janissary/hosts.json`, tied to Requirements 2, 6 and 7: assert the exact import refusal naming the catalog, both catalog files unchanged, `writeFileSync` not called, and no tab update or open.

Leave these existing cases byte for byte unchanged because they pin Preserved behaviors 1 to 7: the successful import, successful export, verb-case, empty import, failed import, missing import operand, failed export, remote-tab and relative-operand cases in `src/plugins/hosts/activate.test.ts`; the oversized-target read failure, mocked write failure, unusable-catalog and happy-path cases in `src/plugins/hosts/export-ssh.test.ts`; and the source-read failure, unusable-catalog, failed-catalog-write and happy-path cases in `src/plugins/hosts/import-ssh.test.ts`.

## Out of scope

- No guard in `exportSshHosts`, `importSshHosts`, `ssh-config-file.ts` or any other module; the rule has exactly one owner.
- No change to ssh-config reading, writing, size limits, managed-section parsing, or successful import/export behavior.
- No new command verb, flag, intent, button or key binding.
- No edit to `help/`, `documentation/user-documentation/` or `documentation/developer-documentation/`.
- No change to the pull request title or description.

## Verification

Run `$janissary/scripts/run.mjs check-diff`; lint, typecheck and both test projects must pass, with every existing import/export case still green.

Then run `npx vitest run --project server src/plugins/hosts/activate.test.ts` and read the new cases: each must show the exact refusal, both catalogs byte for byte unchanged, `writeFileSync` never called, and no `update:hosts` or `open:hosts` event. A successful `Exported ...` report or a changed catalog is a failure. As a second performable check, read `src/plugins/hosts/ssh-intents.ts` and confirm the only guard sits between `targetOf` and both operation calls, that it resolves symlinks and `..` on both sides, and that no guard was added to `export-ssh.ts`, `import-ssh.ts` or `ssh-config-file.ts`.
