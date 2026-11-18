# Build the plain SSH invocation for a saved host

**Complexity: 5/10** — ~61 added production lines, 7 requirements and 15 test scenarios (p=5.298)

## Goal

Give the SSH manager a single command builder for a validated saved host. Source plan: `product/plans/complete/hosts-tab.md`. Depends on `product/plans/ready/hosts-tab-1-catalog-values.md`.

## Implementation

Add two pure helpers in `src/ssh-saved-host.ts`. `savedSshName` accepts an SSH command word followed by whitespace and exactly one token, after trimming the command line. Match the command word case-insensitively and check the token with the catalog's exported name predicate. A sole token starting with a hyphen can name a saved host, including one spelled like a flag. A catalog miss and invocations containing flags with a destination, extra words, or a qualified address go through `parseSshCommand` in `src/ssh.ts:41`. Keep that parser unchanged. The manager owns catalog I/O and lookup.

`buildSavedSshInvocation` accepts a validated `SavedHost` and returns the actual `[user@]host` destination, resolved PTY command text, and remaining arguments in the existing `SshParsed` shape. Include the stored name as the label and keep the optional user out of the destination when absent. Put `-p <port>` before the destination when saved. Place `--` immediately before the destination to make even a leading-hyphen host an operand. With no saved path, send only the connection arguments. With a path, put `-t` among the options before the destination and send one remote command argument after it. Retain its argument boundary in the returned options for the manager, which otherwise would lose it by splitting the generated command text on whitespace.

Quote the remote command as one local-shell word. Move the pure `shellQuote` from `src/harness/index.ts:13` into `src/shell/quote.ts` and keep the harness call sites using it with the same output. `spawnPty` at `src/pty.ts:45` passes the command string through `shellCommandArgs` at `src/shell/startup.ts:45`, so only the remote side expands its environment variables or interprets the remote command separators.

Inside that remote command, change into the saved directory before starting the account's shell as a login shell. Pass ordinary paths as quoted operands, resolving relative paths from the SSH login directory and treating a leading hyphen as part of the name. Resolve bare `~` and the `~/` prefix against the remote home directory with the remainder kept literal. A failed directory change prints its own diagnostic and still starts the login shell in the original directory. Make that continuation explicit even when the remote shell is configured to exit on command failure.

## Tests and verification

Add `src/ssh-saved-host.test.ts` for a bare mixed-case command word, an absent operand, options with a destination, a remote command after the destination, qualified input, and a lone hyphen-prefixed name. Assert argv for a host with no optional fields, optional user and port, a leading-hyphen destination, and a path with a single remote argument. Exercise absolute and relative paths, bare `~`, `~/` paths, and leading-hyphen relative paths. Use a scratch SSH stand-in for the local shell boundary and a login-shell stand-in for the remote command. Assert that a failed `cd` leaves its diagnostic visible and the login shell starts from the original directory even with exit-on-error enabled. Run `$janissary/scripts/run.mjs check-diff`, including the existing literal SSH parser and harness command-builder tests. Inspect the arguments captured by the scratch SSH stand-in to confirm that the local shell leaves remote home and shell expansion to the remote side.

## Out of scope

Manager integration, transcripts, notifications and Sessions.
