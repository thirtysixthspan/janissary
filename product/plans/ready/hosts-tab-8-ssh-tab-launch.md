# Open and record SSH tabs from a saved name

**Complexity: 6/10** — ~62 added production lines across 4 existing files, 15 test scenarios (p=5.767)

## Goal

Use the saved invocation in normal SSH command execution while preserving literal SSH and the user's typed transcript. Source plan: `product/plans/complete/hosts-tab.md`. Depends on `product/plans/ready/hosts-tab-2-effective-file.md` and `product/plans/ready/hosts-tab-7-saved-ssh-invocation.md`.

## Implementation

In `src/ssh-manager.ts:18` (`SshManager.run`), try `savedSshName` before `parseSshCommand`. Read the effective file only for an eligible candidate, using `managers.tab.launchDir` and `homedir()`. Forward the file reader's shared, deduplicated diagnostics through `notify(managers, 'manual', creatorLabel, message)` at `src/notifications/index.ts:194`. A case-insensitive saved match takes precedence over a literal hostname or SSH config alias. The current parser handles an unmatched name, an unusable effective file, qualified addresses, flags with a destination, and commands such as `ssh lab uptime`. A usable home catalog after a malformed project file can still supply a match.

Use `buildSavedSshInvocation` and the same `SshManager.open` path as the literal form. In `src/commands/ssh.ts:8` (the SSH registry entry's `run`), pass the execution tab label to the manager. Resolve that tab as the creator before opening the new tab, so group, group color and `cwdOf` use the source even when a different tab is active. Keep the current-tab default for direct manager callers that omit a label.

Apply `uniqueLabel` to the saved spelling for the tab label. Add optional `hostName` beside `destination` in `src/tab/types.ts:69` (`HarnessView`) and set it only for a saved match. Keep the real `[user@]host` in `destination` so the connections panel still displays `ssh:<destination>`. Copy the builder's complete option arguments to the existing `sshOptions` field. Pass the same resolved command to the PTY and `registerSshObservers` as in `src/ssh-manager.ts:39`. Keep the literal parser's options and command, the sessions change signal, and the PTY-exit lifecycle.

For a typed SSH command, keep the append-before-launch behavior of `runDelegated` in `src/commands/delegated.ts:8`. Use `invocation.line` when available for the transcript and send the normalized registry command to the manager. A Hosts row reaches that same SSH registry entry through `src/plugins/line-capabilities.ts:78` (`dispatchLineWithOutput`). Use the execution tab's plugin id `hosts` at the SSH command origin seam to bypass `runDelegated` for that dispatch and return any immediate error through the existing result channel. The plain SSH recording still belongs to the new tab.

Apply the same narrow Hosts-to-SSH origin rule to the captured dispatch's disabled and exception paths in `src/command/manager.ts:99` (`dispatchLine`) and `:155` (`executeCommandWithContext`). Keep their policy and error reporting through the dispatch result, without appending a command to the Hosts log. Keep transcript capture for other calling tabs and plugins, including Shell. Keep the existing inline `!ssh` routing in place.

## Tests and verification

Extend `src/ssh-manager.test.ts` using `makeManagers` for case-folded lookup, qualified addresses, literal flag and extra-word bypass, unmatched and unusable-file fallback, and notification deduplication across attempts. Check saved port and path in the captured PTY command, grouped launch from a nonactive creator, recorded arguments and observer command, actual panel destination, saved spelling on a suffixed tab label, and normal PTY-exit behavior for literal tabs. In `src/command/manager.test.ts`, extend the `CommandManager delegating harness and ssh` cases for typed attribution and a Hosts origin through captured dispatch. Check that success, a disabled command, and a launch error leave the Hosts log untouched while returning the expected dispatch result. Add a regression check that `!ssh` follows the existing inline shell route.

Update `product/specs/ssh-tab.md`. Run `$janissary/scripts/run.mjs check-diff`. Connect with a scratch `ssh lab` and confirm the creator's typed transcript entry, new tab label, connections destination and recording.

## Out of scope

Hosts row interaction and the Sessions column.
