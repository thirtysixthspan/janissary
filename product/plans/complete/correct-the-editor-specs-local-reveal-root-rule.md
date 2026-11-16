# Correct the editor spec's local reveal root rule

**Complexity: 1/10** — no production code, no tests, and no new units; a one-sentence spec correction (p=1.58).

## Goal

`product/specs/editor-tab.md`, in `### Revealing in the file navigator`, says `A local file takes the shell and harness buttons' root rule.` That is false for the reveal. The shell and harness metadata-row buttons root a navigator at the clicked tab's working directory: `openOrRetarget` in `src/file-navigator/open.ts` passes `workingDirOf(label)` to `openOrRetargetLocalAt`. The editor's reveal instead resolves its own root in `revealTargetFor` (`src/file-navigator/reveal-editor.ts`): the file's enclosing workspace clone when there is one, otherwise the project root when the file sits strictly inside it, otherwise the file's own directory. The sentence that follows the false lead-in already states exactly that rule, so only the lead-in misattributes it. The adjacent metadata-row paragraph in `product/specs/file-navigator-tab.md` already says the editor route reveals the edited file rather than the tab's working directory and leaves the root rule to `editor-tab.md`.

## Design decisions

- **Replace the lead-in only.** The sentence after it gives the reveal's own clone, strict-project-root, and own-directory cases and is correct; changing it would duplicate the rule or lose a case.
- **State the reveal's own rule, not a comparison.** `For a local file, the reveal roots the tree at the file's own place.` introduces the cases that follow without tying the reveal to the buttons' working-directory rule.
- **Keep the open-or-retarget and retarget-clearing sentences.** They match `openOrRetargetLocalAt` and `retarget` in `src/file-navigator/open.ts`: a fresh navigator is docked left, otherwise the most recently focused one is retargeted, and a retarget drops expanded directories and the move undo/redo stacks.
- **Leave the shipped behavior and its tests alone.** `revealTargetFor` and `reveal-editor.test.ts` already cover the root rule; this is a documentation correction only.
- **Leave the file-navigator spec paragraph alone.** Its metadata-row paragraph correctly distinguishes the editor route from the shell and harness buttons and defers the root rule to this spec.

## Proposed changes

`product/specs/editor-tab.md` — in `### Revealing in the file navigator`, replace the sentence `A local file takes the shell and harness buttons' root rule.` with `For a local file, the reveal roots the tree at the file's own place.` Leave the rest of the subsection unchanged, including the sentence listing the workspace-clone, strict-project-root, and own-directory cases and the open-or-retarget and retarget-clearing sentences.

## Tests

No test changes. The shipped behavior does not change and is already covered by `src/file-navigator/reveal-editor.test.ts`, whose `revealTargetFor` cases assert the clone, project-root, own-directory, and path-containment outcomes. This plan changes documentation only.

## Out of scope

- `src/file-navigator/reveal-editor.ts`, `src/file-navigator/open.ts`, and their tests; the root resolution stays exactly as shipped.
- `product/specs/file-navigator-tab.md`; its metadata-row paragraph already states the editor route correctly.
- The shell and harness buttons' working-directory root rule, which is correct as written.

## Verification

- `$janissary/scripts/run.mjs check-diff`
- `npm run docs:build`
- Read the diff to confirm the only spec change is the lead-in sentence and the rest of the subsection is byte-for-byte unchanged.
