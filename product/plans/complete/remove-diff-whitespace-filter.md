# Fix: remove the diff whitespace filter

**Complexity: 4/10** — remove the control and its intent state across the client, plugin contract, session, and git reader while keeping refresh behavior intact.

## Goal

The diff tab always shows whitespace-only changes. It has no Hide whitespace control or filtering behavior.

## Approach

Remove the client toggle and key-triggered refresh path. Make refresh a payload-free intent and have the session recompute the unfiltered change set. Remove `-w` from tracked, untracked, and unborn-repository reads. Update the diff behavior spec and tests for always-visible whitespace changes.

## Implementation steps

1. Remove the whitespace flag from the change-set reader and its tracked, untracked, and unborn-file paths; revise server tests.
2. Remove the whitespace state from the session and make refresh accept an empty payload; revise activation tests.
3. Remove the Hide whitespace control and toggle-driven refresh from the client; revise client tests and the refresh hook.
4. Update `product/specs/diff-tab.md` to state that whitespace-only changes remain visible and remove the control from the header description.

## Tests

- Whitespace-only tracked changes appear in every change-set read.
- Whitespace-only untracked files remain visible.
- Refresh intents recompute without filter state and reject a non-empty payload.
- The client has no Hide whitespace control and manual and periodic refreshes send an empty payload.

## Out of scope

- Diff layout preference, hunk navigation, or file presentation.
- Changes to public help or user documentation, which do not describe this control.
- Unrelated entries in the pull-request backlog.
