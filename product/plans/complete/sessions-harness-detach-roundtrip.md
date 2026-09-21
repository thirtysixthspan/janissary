# Verify harness detach and reattachment together

Issue: detaching a harness tab correctly updates the sessions tab, but the harness tab launches then immediately closes. the row in the sessions tab disappears.

Complexity: 4/10

## Goal

Keep the remote harness running and listed after detachment, then restore its tab without launching another process or losing its session record.

## Approach

The branch already disconnects a channel before closing local tabs, and the preceding fix corrects the local SSH working directory for harness reattachment too. Existing tests exercise these pieces separately. Exercise the real sessions, remote, harness, PTY, tab-cleanup, controller-event, and remote-process components together, replacing only process I/O, observers, and disk persistence. Use a saved remote path that differs from the local directory and deliver transport exits asynchronously, as real PTYs do. If this exposes another lifecycle defect, record its cause and update the implementation steps before fixing it.

## Implementation steps

1. Add integration coverage for detach, reattach, repeated detach, and late old-transport exits. Assert that no kill or shutdown reaches the peer during detach and that restored tabs stay open beyond the provisioning-failure close delay. Extend the real remote-server rendezvous test to cover a PTY shell as well as a piped shell across EOF, SIGHUP, and a fresh relay process. Run check-diff.
2. Document the verified harness lifecycle in the sessions spec, remove the resolved backlog entry, and promote this plan when the full round trip passes.

## Tests

- Detaching a running harness closes its local tab, retains its remote process and saved record, and leaves a detached session row.
- Reattaching opens a running tab for the same remote process and preserves its row beyond the failure-close delay.
- Delayed exits from the detached transport do not close the restored tab or drop its record.
- A second detach/reattach cycle remains functional and does not spawn a second remote harness.
- A real remote PTY retains its process id and workspace after losing its transport and reattaching through a fresh relay.

## Findings

The integrated local lifecycle passes with the preceding SSH working-directory correction and the branch's existing disconnect-before-cleanup behavior. No additional local lifecycle change is required: the regression now covers those components together instead of mocking the detach and reattach operations independently.

The real remote-server test also preserves a PTY shell's process id and workspace through EOF, SIGHUP, and a new relay. Validation adds three integrated lifecycle tests and one real PTY rendezvous case.

## Specs / docs

Update product/specs/sessions-tab.md to describe repeated harness detachment and restoration. The remote-agent lifecycle documentation was corrected with the preceding reattachment fix; no further help or public documentation changes are expected.

## Out of scope

New architecture, SSH authentication, remote harness binary behavior, and PR description edits.
