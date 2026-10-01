# Test-pin the overlay-plugin documentation example

**Complexity: 3/10** — one `describe` block in an existing test file, copying a pattern two other families already
use. No source changes.

## Summary

`documentation/developer-documentation/overlay-plugins.md` states that
"`web/src/overlay-plugins/registry.test.ts` pins the declaration table and the documented example below to the real
files, so neither can drift from what the repository ships". It pins the declaration table. It does not open the
Markdown page, so the claim about the example is false.

The pull request's plan required this pin, in its design decisions and again in its section 8 requirement: the example
is "test-pinned the way `web/src/editor/plugins/registry.test.ts` pins its own page, so the example cannot drift from
the shipped declaration." It was not delivered.

This is a gap the repository has already solved twice. `web/src/editor/plugins/registry.test.ts` reads
`documentation/developer-documentation/editor-plugins.md` and pins the declaration its page shows. `src/plugins/documentation.test.ts`
reads `documentation/developer-documentation/tab-plugins.md` and does the same for the tab-plugin family. The overlay
family is the only one of the three whose page claims a pin it does not have.

## Design decisions

### Pin identifiers, not prose

The editor family's test says so in its own comment: "Nothing here checks prose — these assertions only pin the block
a reader would copy into a new plugin, and the field list that block has to satisfy." Reformatting the page's
explanation must not fail a test, or the test becomes a reason not to edit the documentation.

So each assertion names an identifier the shipped code also carries, rather than comparing a block of text.

### Two things are worth pinning

The page shows **two** code blocks: the declaration object, and the module that `start` returns. Both are what a
reader copies. The declaration block is pinned field by field against the shipped entry; the module block is pinned
against the shape `OverlayPluginModule` and `ContributedOverlay` actually declare, so a dropped member in
`OverlayPluginCapabilities` or a renamed overlay field cannot leave the page teaching an API that is gone.

## Proposed changes

### `web/src/overlay-plugins/registry.test.ts` only

Add a `describe('the developer documentation')` block, following the editor family's shape:

- Resolve the page path from `import.meta.url` the way `src/plugins/documentation.test.ts` does, so the test does not
  depend on the working directory.
- Extract the declaration block — the fenced `ts` block whose first field is `id: 'clipboard-history'` — and assert it
  carries the shipped entry's `id`, `version`, `apiVersion`, `command`, `title`, `emptyText`, and the `chord` from
  `overlayPluginDeclarations`.
- Extract the module block and assert every member of `OverlayPluginCapabilities` appears in the page's capability
  table, and that the members the module block returns match `OverlayPluginModule`'s and `OverlayPluginOverlay`'s
  declared keys.
- Assert the page names `registry.test.ts` as its pin, so the sentence the entry exists to make true cannot be deleted
  quietly.

No source file changes. The existing declaration-table, refusal, and literal-dynamic-import cases in that file must
keep passing unchanged.

## Tests

The new block is the whole deliverable. `web/src/shared/clipboard-captures.test.ts` already establishes the precedent
of a `web/src` test reading a repository file by relative path, and `web/src/editor/plugins/registry.test.ts` of one
resolving by `import.meta.url`; this follows the latter because it is the more robust of the two.

## Out of scope

- Correcting any inaccuracy in the page's prose. If the assertions surface a real inaccuracy, that is a separate
  change with its own review.
- Pinning the tab-navigator or registry-table prose elsewhere on the page.

## Verification

- `./scripts/run.mjs check-diff`.
- A deliberate edit to the page's example should fail the new block, which is the check that it is pinning something.
