# `open external` hands an unclaimed file type to the OS handler

**Complexity: 3/10** — one branch in the `open` dispatcher plus the tests, spec, and doc sentences that describe the old refusal. No contract change, no new opener, no client change.

## Goal

Choosing **Open externally** for a file type no opener claims actually opens it. A PDF picked from the file navigator's chooser reaches the operating system's handler — Preview on macOS — instead of reporting `No opener for ".pdf" files.` and doing nothing.

The inline presentation is unchanged: `open notes.pdf` still reports the unsupported type, because there is no in-app view to route it to. Only the external presentation gains the fallback, and only where the user asked for an external program by name.

## Approach

1. **The refusal is in the wrong place for the external presentation.** `OpenFileManager.openOne` resolves an opener from the extension and, finding none, reports the unsupported type for *both* presentations. But the external presentation does not need an opener: every file opener's external presentation ends at the same OS-level handoff, and the operating system already knows which application claims a `.pdf`. The registry lookup is what decides *which in-app view* a file gets — a question `open external` never asks.

2. **Fall back to the shared default-viewer helper, not to a new PDF opener.** Registering a `pdf` opener would fix PDFs and leave `.pages`, `.numbers`, `.zip`, `.dmg`, and every other unclaimed type refusing the same way. `openInDefaultViewer` (`src/openers/external-viewer.ts`) is what the markdown and image openers already use for exactly this handoff, and it already carries the two confirmations the spec requires: the file was opened in the default viewer, or — when no OS handler could be launched — the file's path in place of a confirmation. Using it keeps every external open confirming identically, whether an opener claimed the extension or not.

3. **A pinned opener still refuses.** A tab plugin's own command (`video external notes.pdf`) reaches this same path with `requireOpener` set. The pin means "this command is a second route into one opener," so a file that opener does not claim must still be refused rather than quietly handed to the OS — otherwise `video external notes.pdf` would launch Preview. The fallback is therefore gated on there being no pin, leaving what a pinned command reports exactly as it is today.

4. **The directory case is already handled upstream.** `openOne` runs after the existence check, and the file navigator only offers the chooser for file rows, so the fallback cannot receive a directory from either route.

## Implementation steps

1. `src/open/file-manager.ts`: import `openInDefaultViewer` from `../openers/external-viewer.js`. In `openOne`, when `openerForExtension` returns nothing, hand the file to `openInDefaultViewer(file, context)` when the presentation is external and no opener is pinned; otherwise append the existing unsupported-type line unchanged.

## Tests

`src/open/file-manager.test.ts` (the `OpenFileManager.run` describe, using the existing `didOsOpen` mock):

- `open external <file>.pdf` hands the file to the OS handler and confirms in the originating tab, opening no tab.
- `open <file>.pdf` still reports `No opener for ".pdf" files.` and never reaches the OS handler, so the inline presentation is unaffected.
- An external open whose OS handoff fails reports the file's path instead of a confirmation.
- A pinned command (`video external notes.pdf`) still reports the unsupported type and never reaches the OS handler, so a plugin's own command cannot be turned into a general OS-open route.

## Out of scope

- Registering a PDF opener or a PDF tab — an unclaimed type still has no in-app view.
- Making the fallback configurable through `externalViewers`; that map is keyed by opener name, and a file with no opener has no key.
- The remote-tree refusal of `open external`, which is decided before the dispatcher is reached.
- Changing what the file navigator's chooser offers, or the order of its entries.
