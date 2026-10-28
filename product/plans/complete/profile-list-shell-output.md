# Return `profile list` output to the shell command bar

**Complexity: 3/10** — the profile manager already builds and appends the requested list. The command adapter drops the invocation context, so shell command-bar output capture cannot associate that reply with the active command. Passing the existing context through and using the shared append helper fixes the gap without new architecture.

## Goal

Make `profile list` return its profile names through shell command-bar dispatch, while keeping the same output in the issuing tab's application transcript.

## Approach

Pass the optional `CommandInvocationContext` from the profile command adapter into `ProfileManager.run`. Have the manager append every reply through `appendCommandOutput`, which tags invocation output with the active invocation id. Ordinary dispatches without an invocation keep using the existing tab append path.

## Implementation steps

1. Forward the invocation context from `src/commands/profile.ts` to `ProfileManager.run`, and use `appendCommandOutput` in `src/profile/manager.ts` for profile replies.
2. Add a manager test that verifies invocation-aware output and a command-dispatch regression test that confirms `profile list` returns captured output.
3. Update `product/specs/profiles.md` to specify that the names are returned as the command reply, including when dispatched from a shell command bar.

## Tests

- `src/profile/manager.test.ts`: verify a `profile list` reply is appended with the supplied invocation id.
- `src/command/manager.test.ts`: verify shell-style `dispatchLineWithOutput('janus', 'profile list')` returns the profile list produced by the command.

## Documentation

No help or user-documentation change is needed. The shell command-bar page already explains that application command replies appear below the command, and the profile page already says that `profile list` names available profiles.

## Out of scope

- Changing profile discovery, sorting, or project-over-built-in precedence.
- Changing output capture behavior for other commands or managers.
- Changing profile launch behavior.
