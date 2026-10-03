# Server-side overwrite consent for file-navigator rename

## Complexity

6/10. The rename result and optional consent must pass through the protocol, dispatcher, controller, manager, local filesystem port, remote operation, and client request hook. Local and remote filesystems must detect actual destination collisions while allowing a case-only rename of the same entry. Tests cover the contract at each boundary.

## Goal

Renaming a file or directory must not replace an occupied destination until the user confirms. The server checks the filesystem it mutates, so stale or incomplete client rows cannot authorize replacement. A successful rename still retargets an open editor; a refused or failed rename leaves selection unchanged.

## Approach

Add optional overwrite consent to the rename request and make the operation return its result to the client. Return a conflict result when a different entry already occupies the target. Preserve case-only renames by identifying the source and destination as the same filesystem entry where the platform is case-insensitive. Thread the same behavior across remote frames and reject older protocol peers by bumping the remote protocol version. The client opens the existing overwrite dialog on either a visible-row hint or a server conflict, retries with consent, and updates selection only after success. Check remote path resolution and symlink semantics while implementing so destination checks occur on the mutation host.

## Implementation steps

1. Trace the move overwrite-consent contract across its protocol, client, controller, manager, filesystem port, remote descriptor, and tests; mirror those established patterns for rename.
2. Add the rename result and consent to the server contract and local filesystem operation, preserving case-only rename behavior.
3. Carry the contract through the manager, controller, client-message dispatcher, remote filesystem operation, and protocol version.
4. Update the rename hook to await the result, prompt on server conflict, retry with consent, and retain selection on failure.
5. Add local and remote conflict/refusal/retry tests, case-only rename coverage, and selection preservation coverage.

## Tests

- Local filesystem tests: occupied target refuses without changing either entry; confirmed retry succeeds; case-only rename succeeds.
- Manager/controller/dispatcher tests: conflict propagates without failure notification or history mutation; consent is forwarded.
- Remote operation and serving tests: remote host detects conflict and preserves both entries until confirmed.
- Client tests: server conflict opens the existing dialog; confirmation retries with consent; failed rename preserves selection.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Specification and documentation

Update `product/specs/file-navigator-tab.md` to specify host-side conflict detection and confirmed retry. Update `product/specs/remote-server.md` for the remote protocol version change. Update `help.md` or user documentation only if either currently describes the behavior being changed.

## Out of scope

- Changes to move, paste, or undo semantics.
- New overwrite dialog UI.
- Changes to documentation that does not already describe rename behavior.
