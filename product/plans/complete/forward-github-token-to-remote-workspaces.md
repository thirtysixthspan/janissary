# Forward GitHub credentials to remote workspaces

**Complexity: 4/10** — extend the existing remote protocol with one optional credential field, thread it through remote process creation, and update focused protocol and process tests.

## Goal

Let a workspaced agent or harness running on a remote machine use the local project's scoped `.janissary/github-token` for `git push` and `gh`, without requiring a second token file on the remote host.

## Approach

Send the already-loaded scoped token in the encrypted SSH channel's provisioning frame. Keep it in the remote session object and pass it only to that session's sandboxed workspace processes, where the existing sandbox environment builder exposes it as `GH_TOKEN`. The token remains optional, with the remote project's own configured token retained as a fallback.

## Implementation steps

1. Extend remote provisioning to carry the local scoped GitHub token and retain it for the lifetime of the remote session.
2. Pass the forwarded token into remote PTY and shell sandbox options instead of loading credentials from the remote project.
3. Update the remote-server functional spec and existing user documentation to describe credential forwarding.

## Tests

- Verify the remote frame codec round-trips a provisioning frame containing a GitHub token.
- Verify remote process launches inject the forwarded token into sandboxed PTY and shell environments.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Out of scope

- Forwarding SSH keys, keychain credentials, or arbitrary environment variables.
- Persisting the forwarded token on the remote machine.
- Changing authentication for ordinary non-workspaced SSH tabs.
