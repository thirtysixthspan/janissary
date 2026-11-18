# Open SSH tabs using saved names

**Complexity: 6/10** — ~110 added lines, 6 existing production files and 12 scenarios (p=5.97)

## Goal

Work unit 5 of [Hosts Tab](../complete/hosts-tab.md). Depends on [Select and persist the effective hosts file](../ready/hosts-tab-2-host-storage.md).

## Implementation

- **ssh tab from a saved host (user decision).** An ssh tab opened through a saved host — a row click or `ssh <name>` — is labeled with the host name (disambiguated `-2`, `-3`, … as today). A typed `ssh <name>` records `ssh <name>` in the creator's transcript, as typed. A row click records nothing anywhere: the hosts tab has no transcript, and the new tab and its recording are the record. The connections panel keeps showing `ssh:<destination>`.

- **`ssh <name>` lookup (user decision).** Only a bare `ssh <name>`, with nothing else typed, looks up a saved host; a matching name wins over a literal hostname or `~/.ssh/config` alias of the same spelling. Any form with flags or extra words (`ssh -p 22 devbox`, `ssh devbox uptime`) passes to ssh verbatim, as today.
- **Saved path in an ssh tab (user decision).** After login the remote shell changes into `path`. When the directory does not exist the remote shell prints its own error and the session continues in the login directory.

### Resolve and launch in the SSH manager

- In `src/ssh-manager.ts:19` (`SshManager.run`), try lookup before the existing `parseSshCommand` call only for an unquoted single token that uses the saved-name character set. Resolve case-insensitively using the effective file from `managers.tab.launchDir` and `os.homedir()`. On a miss, including an unusable effective file, pass the original input through `parseSshCommand` unchanged. Report each observed problem through `src/notifications/index.ts:194` (`notify`), using the existing `plugin-note` event and the storage unit's interactive memo.
- Build the saved launch command in `src/ssh-saved-host.ts`. Put the optional `-p <port>` and path-triggered `-t` before an explicit SSH end-of-options delimiter and put the validated `[user@]host` after it. A destination beginning with a hyphen remains an operand. With a path, pass one remote command argument that attempts the directory change and then execs the remote user's login shell regardless of the change's status. Quote the path as data, resolve a leading `~` or `~/` against the remote home, and prefix a leading hyphen with `./` for a relative path. Keep the real `cd` error visible.
- Reuse `SshManager.open` for the tab, PTY, observers, and sessions event. Pass the stored name through `uniqueLabel`. Add optional `hostName` beside `destination` in `src/tab/types.ts` (`HarnessView`), set only on the saved route, and keep `destination` as `[user@]host` for the connection display. Give the PTY and its observers the same resolved command. Leave the literal route's command and `sshOptions` behavior intact.

### Preserve typed transcripts and support a transcript-free Hosts row

- Keep the single SSH command in `src/commands/ssh.ts`. Typed calls continue through `runDelegated`, with the original invocation line for the transcript when available and the resolved registry input for the manager. Add a private invocation marker for a Hosts row dispatch to `CommandInvocationContext`. In `src/plugins/line-capabilities.ts:78` (`dispatchLineWithOutput`), set it only for the Hosts declaration dispatching SSH from its live, owned answering tab. Pass it through the internal `CommandManager.dispatchLineWithOutput` call. The published capability still takes just the line. A typed command or a dispatch from another plugin never sets this marker.
- For a marked invocation, call the same manager and return any error through the existing structured dispatch response without appending the input or error to any transcript. Apply that rule to the dispatcher's own refusal and caught-error paths for marked SSH calls. If the Hosts answering tab disappeared, return a failed dispatch instead of falling back to its source tab. The Hosts plugin will consume the response in its own work unit.

## Tests

Extend `src/ssh-manager.test.ts` for successful saved lookup with and without optional fields, saved-name precedence and case folding, disambiguated labels, literal passthrough with extra tokens, malformed-file fallback and notification deduplication. Cover a leading-hyphen destination, remote home path, leading-hyphen relative path, and a missing directory that leaves an interactive login. Exercise typed and marked dispatch in the existing command and plugin capability tests, including a refusal and a vanished answering tab. Update `product/specs/ssh-tab.md`.

## Out of scope

Hosts tab wiring and extra per-host flags.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Launch saved names against a fixture with an existing path and a missing path.
