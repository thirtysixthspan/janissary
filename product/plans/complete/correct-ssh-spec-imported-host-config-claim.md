# Correct the ssh spec on config settings for imported hosts

**Complexity: 1/10** — 0 production lines, 0 production files and 0 test scenarios or new units; a single spec paragraph is rewritten (p=1.578).

## Goal

Make the saved-host destination section of the ssh spec tell the truth about an ssh-config import. The current paragraph says `IdentityFile` and `ProxyJump` "stop applying" and that "the launch uses the saved values alone," but the launch path spawns the real ssh binary with no config override, so ssh still reads the user's config for the real destination. A reader who takes the spec as a guarantee of isolation ends up surprised by a key or jump host they thought had been left behind. The goal is a spec that separates what the catalog stores from what ssh does at launch, without changing either.

## Requirements

1. "Rewrite the paragraph added to product/specs/ssh-tab.md § Saved host destinations so it states that the catalog stores only destination, user and port."
2. "settings attached to the imported alias name are therefore not carried into the saved host."
3. "the real ssh binary still reads the user's ssh config when the saved host is launched."
4. "Point to buildSavedSshInvocation in src/ssh-saved-host.ts, which emits ssh plus optional -p/-t, -- and [user@]host with no -F or config overrides."
5. "and to parseSshCommand in src/ssh.ts, which spawns the generated command as-is."
6. "Add one example contrasting a `Host <alias>` block, which no longer matches the real destination after import, with a `Host *` or destination-matching block, which still applies at launch."
7. "Keep the parallel statement in product/specs/hosts-tab.md § Importing and exporting consistent" with "other ssh settings do not carry over" still describing the catalog.
8. "No code change is required."
9. "No test change is needed because no test asserts spec wording."

## Design decisions

- This is a spec-only correction: one paragraph in `product/specs/ssh-tab.md` is rewritten, and no source, test, help page, or user/developer documentation is touched.
- The rewritten paragraph describes the split the code actually implements: the catalog keeps three fields, and ssh keeps its normal config lookup at launch.
- The distinction that matters is between the imported alias name and the real destination, stated in the example rather than left to inference.
- `product/specs/hosts-tab.md` keeps its sentence about settings not carrying over, because that sentence is about the catalog and remains true.
- The named functions are mentioned because developer specs name the implementation where it disambiguates behavior; they are not presented as a behavior change.

## Preserved behavior

1. A saved host still launches the real ssh binary with the stored user, host and port and no `-F` or `-o` config override; it must not gain a flag that suppresses the user's config. The existing test `builds a bare invocation for a host with no optional fields` in `src/ssh-saved-host.test.ts` pins the generated argument list.

## Assumptions

1. `src/ssh-saved-host.ts:38` `buildSavedSshInvocation` builds `prefix = ['ssh']`, adds `-p` for a port and `-t` for a path, pushes `--`, then appends the real `[user@]host`; there is no `-F` or `-o` in that construction.
2. `src/ssh.ts:41` `parseSshCommand` returns `{ command: trimmed, destination, label, options }`, and its doc comment at `src/ssh.ts:34` says the command is "spawned as-is."
3. `src/ssh-manager.ts:71` `this.managers.pty.spawn(label, 'ssh', command, cwd)` runs that command string verbatim, so the ssh binary, not janissary, decides which config file to read.
4. `product/specs/ssh-tab.md:68` currently reads "Other ssh settings from the config, such as `IdentityFile` and `ProxyJump`, stop applying: the catalog stores no field for them, so the launch uses the saved values alone."
5. `product/specs/hosts-tab.md:133` currently reads "other ssh settings do not carry over," a statement about what the catalog holds.

## Existing functionality

1. `buildSavedSshInvocation` in `src/ssh-saved-host.ts:38` already produces the literal invocation the spec needs to describe.
2. `parseSshCommand` in `src/ssh.ts:41` already parses a bare ssh command and returns its verbatim text.
3. `SshManager.open` in `src/ssh-manager.ts:52` already hands that verbatim text to the PTY spawn.
4. The saved-host paragraph in `product/specs/ssh-tab.md:68` is the existing text to rewrite.
5. The import paragraph in `product/specs/hosts-tab.md:132` is the existing parallel statement to leave consistent.

## Implementation steps

1. Replace only the paragraph at `product/specs/ssh-tab.md:68-70`. State that an imported host keeps just its destination, user and port in the catalog, so settings tied to the alias name are not saved with it; then state that the launch still calls the real ssh binary with those values and no config override, so ssh reads the user's config for the real destination. Name `buildSavedSshInvocation` in `src/ssh-saved-host.ts` and `parseSshCommand` in `src/ssh.ts` as the code that establishes each half, following the developer-spec convention of naming the owning implementation. Add a short example with two config blocks: a `Host <alias>` block that stops matching once the launch uses the real destination, and a `Host *` or destination-matching block whose `IdentityFile` or `ProxyJump` still applies at launch. Keep the surrounding paragraphs byte for byte. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Read the paragraph in `product/specs/hosts-tab.md:132-134` and confirm it still says the catalog holds only destination, user and port and that other settings do not carry over. Do not edit it: adding a claim that launch-time config is ignored would reintroduce the same error the ssh spec is being corrected for. Build command: `$janissary/scripts/run.mjs check-diff`.
3. Confirm no source file, test file, help page, or file under `documentation/user-documentation/` or `documentation/developer-documentation/` was changed. Build command: `$janissary/scripts/run.mjs check-diff`.

## User interface

1. No user interface surface is added or changed; this change edits two functional spec files only.

## Tests

This plan changes no application behavior and introduces no code, so no tests are written and no existing test is changed. Tests of documentation wording are not introduced. The existing `src/ssh-saved-host.test.ts` and `src/ssh.test.ts` suites stay green and continue to pin the argument shape the corrected prose describes.

## Out of scope

- No change to `buildSavedSshInvocation`, `parseSshCommand`, `SshManager.open`, or any other source file.
- No change to the import or export behavior, the saved-host catalog format, or the SSH tab UI.
- No change to `product/specs/hosts-tab.md`, whose parallel statement stays accurate as written.
- No edit to `documentation/user-documentation/` or `documentation/developer-documentation/`, which are owned by `update-documentation.md`.
- No help page update: no command, flag, or key binding changes.
- No change to the PR title or description.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after each implementation step; it must stay green. Then read `product/specs/ssh-tab.md` § Saved host destinations and confirm the rewritten paragraph says the catalog stores only destination, user and port, that settings attached to the alias name are not carried into the saved host, and that the real ssh binary still reads the user's ssh config at launch with no config override from janissary; confirm the example contrasts a `Host <alias>` block that no longer matches with a `Host *` or destination-matching block that still applies. Read `product/specs/hosts-tab.md` § Importing and exporting and confirm its "other ssh settings do not carry over" sentence is unchanged and still framed as a statement about the catalog. Finally confirm that `git diff --name-only` lists no source, test, help, or documentation-tree files, only the ssh spec plus the plan and backlog bookkeeping.
