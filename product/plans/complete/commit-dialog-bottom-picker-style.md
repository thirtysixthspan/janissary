# Commit-message field matches the Open-with picker's placement and title

**Complexity: 4/10** — a positioning class swap in `theme.css`, one new prop threaded through two files, and a title string computed from a count already available at every call site. No new state machine, no new component.

Backlog text: *"The commit dialog should open at the bottom of the file navigator and look just like the dialog used for the open with menu item. The title should be 'Commit message' where N is the number of files being commited."*

`FileNavigatorCommitPopup` (`web/src/file-navigator/FileNavigatorCommitPopup.tsx`) currently renders a small top-right card — `.files-commit-popup` shares `.file-search-popup`'s positioning rule in `web/src/theme.css:763`–`:766` (`position: absolute; top: 34px; right: 8px; width: 280px;`) — with no visible title, only an `aria-label="Commit message"` on the input itself. `FileOpenerPicker` (`web/src/file-navigator/FileOpenerPicker.tsx`), the "open with" dialog, instead uses the shared `.picker` class (`theme.css:433`–`:438`: `position: absolute; left: 0; right: 0; bottom: 0;`, full-width, bottom-docked) with a visible `.picker-title` header bar reading `Open {name} with`.

## Design decisions

**The commit field adopts `.picker`'s positioning, not a new one.** `.picker` is already the codebase's bottom-docked overlay shape, used by the history picker, the tab navigator, and `FileOpenerPicker`. Reusing it is what "look just like the dialog used for the open with menu item" asks for directly, and it costs nothing new in `theme.css`.

**The title text is `Commit message` for one file and counts otherwise, mirroring `defaultCommitMessage`'s own singular/plural split.** The backlog text's literal quoted title, `'Commit message'`, plus "where N is the number of files being committed," reads most naturally as: the base title is `Commit message`, and a parenthetical count follows so the dialog names its own scope the way `Open {name} with` names its target. The title becomes `Commit message` for exactly one file and `Commit message (N files)` for any other count (including zero, the nothing-changed case the header button can still open). Singular is `Commit message` alone rather than `Commit message (1 file)`, since a bare `Commit message` is the plain reading of the quoted title and a count of one gains nothing by being spelled out — the pre-filled message text below it already reads `sync: <filename>` at that point, naming the one file directly.

**The file count comes from a new value carried on `PendingCommit`, not from `paths.length` alone.** The row menu's calls already pass the exact paths being committed, so `paths.length` would be correct for them, but the header button's whole-tree form passes `paths: []` and gets its count from `files.changedCount` instead (`FileNavigatorTab.tsx:93`). `useFileNavigatorCommit`'s `request` already takes a `defaultMessage` override for exactly this reason; a `fileCount` override alongside it, defaulting to `paths.length`, follows the same pattern rather than inventing a second way to answer "how many".

**No change to the input, its keyboard handling, or the blur-does-not-close rule.** This fix is the dialog's chrome and position, not its behavior — `onKeyDown`, `autoFocus`, `committableMessage`, and the deliberate absence of `onBlur` in `FileNavigatorCommitPopup.tsx` are untouched.

## Proposed changes

**`web/src/file-navigator/useFileNavigatorCommit.ts`.** `PendingCommit` gains `fileCount: number`. `request(paths, defaultMessage = defaultCommitMessage(paths), fileCount = paths.length)` takes a third optional parameter the same shape as the existing `defaultMessage` override, and stores it on the pending state.

**`web/src/file-navigator/FileNavigatorTab.tsx`.** `commitEverything` (`:93`) passes the third argument explicitly: `commit.request([], defaultCommitMessageForCount(files.changedCount ?? 0), files.changedCount ?? 0)` — the same count it already uses for the default message text, so the title and the pre-filled message never disagree about how many files are involved.

**`web/src/file-navigator/FileNavigatorCommitPopup.tsx`.** Gains a `fileCount: number` prop. Computes `title = fileCount === 1 ? 'Commit message' : \`Commit message (${fileCount} files)\`` and renders it in a new `<div className="picker-title">{title}</div>`, the same element `FileOpenerPicker` uses, as the first child inside the popup's outer `<div>`. That outer `<div>` gains the `picker` class alongside its existing `files-commit-popup` class (`className="picker files-commit-popup"`), so it picks up `.picker`'s bottom-docked positioning while keeping its own class for the input styling that follows. The input's own `aria-label="Commit message"` is untouched, so existing `getByLabelText('Commit message')` lookups keep resolving to the input and not the new title element.

**`web/src/file-navigator/FileNavigatorOverlays.tsx`.** Passes `fileCount={commit.pendingCommit.fileCount}` to `FileNavigatorCommitPopup` beside the existing `defaultMessage` prop (`:112`–`:119`).

**`web/src/theme.css`.** Drop `.files-commit-popup` from the shared top-right rule at `:763`–`:766`, leaving only `.file-search-popup` there — the two are no longer the same shape, so they no longer share that selector. `.files-commit-popup`'s own `.command`/`.command input` rules (`:768`–`:772`) are untouched; they style the input regardless of which positioning class sits beside `files-commit-popup` on the outer element.

## Tests

- **`web/src/file-navigator/FileNavigatorCommitPopup.test.tsx`**: `renderPopup` gains a `fileCount` parameter (default `1`, matching its existing single-file `defaultMessage` default) and passes it through. New cases: the title reads `Commit message` for `fileCount: 1`; it reads `Commit message (3 files)` for `fileCount: 3`; it reads `Commit message (0 files)` for `fileCount: 0`. Existing cases (Enter, Escape, empty-cancels, blur-keeps-open, keystroke-containment) are unaffected and need only the new prop threaded through their `renderPopup` calls.
- **`web/src/file-navigator/useFileNavigatorCommit.test.ts`** (if it exists) or a new case in whichever file covers this hook: `request` with no third argument defaults `fileCount` to `paths.length`; passing one explicitly overrides it, the way overriding `defaultMessage` already works.
- **`web/src/file-navigator/FileNavigatorTab.test.tsx`**: the header button's whole-tree commit opens the popup with a title reflecting `changedCount` (e.g. `Commit message (3 files)` for the existing three-change fixture at `:162`–`:173`); a row-menu commit for a single file opens with the plain `Commit message` title.
- **`web/src/file-navigator/FileNavigatorOverlays.test.tsx`**: the re-target case at `:373`–`:392` already switches between a one-file and a whole-tree `pendingCommit`; extend its two fixtures with `fileCount` and assert the title text changes alongside the message on re-target.

## Out of scope

- **Any change to what counts as "one file" versus "several."** A directory row named in `paths` still counts as one path, exactly as `defaultCommitMessage` already does — this fix does not walk directory contents to produce a deeper count.
- **The notification lines, the button's own three-state styling, or the coalescing/blur rules.** Only the popup's position, its class list, and its new title element change.

## Verification

```
$janissary/scripts/run.mjs check-diff
```

Manual check: open a file navigator on a git repository with a changed file, right-click it and choose **Commit to origin** — the field opens docked to the bottom of the tree, full-width, with a `.picker-title` bar reading `Commit message`, visually matching **Open with**'s picker. Select two changed files and repeat — the title reads `Commit message (2 files)`. Click the header **Commit changes to origin** button with three changes under the root — the title reads `Commit message (3 files)`.
