# Restore attached agent tabs and history

Complexity: 4/10.

## Goal

Attaching a detached remote session opens its surviving agent tabs with retained output available immediately for scrolling and review.

## Findings

The launching agent binds its shell when provisioning settles, but joined agents only register an adoption and create an empty tab. Their replay is discarded before the first command binds the shell. Adopted shell output also enters both the transcript and the stdout stream, so buffered history can contaminate the next command. Transcript restoration does not announce changes when output arrives after the tab has been broadcast.

## Approach and implementation

1. Bind each restored joined agent's existing shell immediately after creating its tab, before unclaimed output is discarded. Preserve recorded labels through normal collision handling and reuse the remote process.
2. Route output from idle adopted shells into the restored transcript without buffering it for the next command. While a command or working-directory query owns stdout, keep its output on that normal path. Publish restored transcript changes through the existing state event and respect the configured transcript limit.
3. Add regression tests with real managers and fake remote transport for joined agents, repeated detach/attach, label collisions, and retained output before the session-state answer. Test command execution after replay and output arriving after restoration.
4. Update `product/specs/remote-server.md` and the existing remote-agent documentation. Promote this plan and push to PR 1143, leaving it open. The work item was supplied directly by the user; no backlog entry needs removal.

## Tests

- Reattaching a session restores a joined agent in a new tab, with the retained history from before and during detachment, before any new command.
- Repeat restoration with an occupied original label and verify the old process survives without another spawn.
- Replayed bytes never enter the next command's output; command and pwd output do not produce duplicate transcript entries.
- Idle output after restoration emits a state update and observes transcript retention.
- Run `./scripts/run.mjs check-diff` for each implementation step.

## Out of scope

New remote protocols, unlimited history retention, recovery of history that older peers did not retain, remote file navigator restoration, and merging the PR.

## Verification

Four new regression cases across three test files cover immediate joined-agent history, repeated restoration with and without label collisions, command and pwd isolation from replay, state publication, and transcript retention. The joined-agent cases reproduced an empty log before the binding fix; the adapter case reproduced historical output contaminating a new command. Diff-scoped lint, server and web typechecks, and related server tests pass. No help text describes this behavior, so only the existing remote-agent documentation is updated.
