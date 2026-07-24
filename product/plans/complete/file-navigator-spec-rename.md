# Rename file-tree-tab spec to file-navigator-tab

**Complexity: 2/10** — a terminology substitution across one primary spec file and 7 cross-references, no behavior change.

## Goal

`product/specs/file-tree-tab.md` and its cross-references still described the feature as the "file tree tab," while the backend, React components, CSS, and public documentation have all already moved to "file navigator." Finish the rename in the functional specs.

## Background

This is the last piece of the technical-debt item that started as a combined backend + CSS + web-components + documentation + spec rename. The other pieces were each resolved as separate items; only the spec files were left, deferred without a fresh complexity rating pending being split out.

The target spec already showed a partial rename: a few sections (the metadata-row button, header buttons, "Creating a new file") already said "file navigator," while most of the document — including its own title — still said "file tree tab." The user-facing docs site (`documentation/user-documentation/tab-types/file-navigator.md`) established the precedent this spec should follow: rename the *entity name* ("file tree tab" → "file navigator tab") but keep the generic body pronoun "the tree" for the data structure itself, since that prose already reads naturally and matches the already-completed docs page.

## Approach

1. Rewrite every "file tree tab" / "File Tree Tab" occurrence in `product/specs/file-tree-tab.md` to "file navigator tab" / "File Navigator Tab", matching the Title Case convention used by sibling specs (`# Editor Tab`, `# Markdown Tab`, `# SSH Tab`).
2. Rename the file itself to `product/specs/file-navigator-tab.md`, matching the `-tab.md` naming convention used by other tab-type specs.
3. Update the 7 spec files that cross-reference it, both the filename and any inline "file tree" prose.

## Implementation

1. **`product/specs/file-tree-tab.md`** → `product/specs/file-navigator-tab.md`: renamed title, and all 20 "file tree tab"/"File Tree Tab" occurrences → "file navigator tab"/"File Navigator Tab".
2. **`product/specs/profiles.md`** — "a file tree or the schedules tab" → "a file navigator or the schedules tab".
3. **`product/specs/keyboard-navigation.md`** — "A focused file tree tab captures" → "A focused file navigator tab captures"; "see File Tree Tab" → "see File Navigator Tab".
4. **`product/specs/notifications.md`** — three mentions of "the file tree tab" / `file-tree-tab.md` updated.
5. **`product/specs/editor-tab.md`** — cross-reference path updated.
6. **`product/specs/sidebars.md`** — two cross-reference paths updated.
7. **`product/specs/tabs.md`** — cross-reference path updated, plus "the file tree navigator" → "the file navigator".
8. **`product/specs/application-state.md`** — "file tree, monitor" → "file navigator, monitor" in the view-tabs list.

## Explicitly unchanged

- `product/plans/complete/*.md` — historical plan files that reference `file-tree-tab.md` as it existed when they were written stay as-is, the same way `CHANGELOG.md` entries aren't rewritten for past renames.
- Generic "the tree"/"tree" prose describing the row list itself throughout the spec — matches the already-established docs-site convention.

## Tests

None — spec files aren't executable and have no test coverage; no behavior changed.

## Out of scope

- Any code change (already done in prior items).
- `help.md` and `documentation/user-documentation/` (already correct).
