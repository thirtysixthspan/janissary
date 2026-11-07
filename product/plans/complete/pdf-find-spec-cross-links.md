# Add editor and shell spec cross-links to the PDF Find section

Complexity 2/10 — a one-sentence spec edit with no code, test, behavior, or documentation change. The only judgment is naming the two owning specs, which both exist and already describe the same overlay.

`product/specs/pdf-tab.md` § Find opens by saying `Cmd+F` opens the editor tab's find overlay over the PDF tab, then "It is the same overlay the editor and shell tabs use." The shared-overlay contract is owned by `product/specs/editor-tab.md` § Finding a line and `product/specs/shell-tab.md` § Transcript search, but the PDF section names them only in prose, with no `[[editor-tab]]` or `[[shell-tab]]` link, even though the same spec already links `[[tab-plugins]]`, `[[profiles]]`, and `[[notifications]]`. Without the links, a reader cannot follow the shared contract to its owners, and a later change to the editor or shell find can land without the PDF section being checked.

## Goal

The PDF Find section's first paragraph points at the two specs that own the shared overlay, so the dependency is followable in both directions. No prose claim changes and no behavior changes.

## Approach

In `product/specs/pdf-tab.md` § Find, in the first paragraph, change only:

> It is the same overlay the editor and shell tabs use

to:

> It is the same overlay the editor (see [[editor-tab]]) and shell (see [[shell-tab]]) tabs use

This matches the established cross-link style elsewhere in the same paragraph and file (`see [[tab-plugins]]`, `see [[profiles]]`, `see [[notifications]]`) and the shell spec's own back-reference to `[[editor-tab]]`. The rest of the paragraph and section stays byte-for-byte unchanged. No code, test, help page, or user documentation refers to this sentence, so nothing else changes.

## Implementation steps

1. Edit the one clause in `product/specs/pdf-tab.md` § Find.
2. Confirm `product/specs/editor-tab.md` still has `### Finding a line` and `product/specs/shell-tab.md` still has `### Transcript search`, so both link targets resolve.
3. Run `$janissary/scripts/run.mjs check-diff`; a spec-only change should report nothing scoped to lint or test.

## Tests

None — no code changed, and the specs have no automated prose test. `check-diff` must stay clean; the only correctness check is that both wiki-link targets exist, which step 2 confirms.

## Out of scope

- Any source, test, CSS, help, or user-documentation change.
- Rewording the rest of § Find, including its second cross-link-worthy claims.
- Editing `product/specs/editor-tab.md` or `product/specs/shell-tab.md`; both are read-only targets here.
- The PR title and body, which this entry does not name.
- The backlog's other recorded entry, which is worked by its own invocation.
