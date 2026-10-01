# Open the clipboard-history popup with Cmd+Shift+V as well as Ctrl+Shift+V

**Complexity: 3/10** — one optional declaration field, chord-list handling in validation and in the host's refusal and claim paths, the terminal passthrough predicate, and the docs that name the chord.

## Goal

The pull request backlog asks that `Cmd+Shift+V` open the clipboard-history popup as well as `Ctrl+Shift+V`. On macOS, Cmd is the modifier every other application chord here uses (`Cmd+P`, `Cmd+F`, `Cmd+T`), so a Mac user reaches for `Cmd+Shift+V` first and gets the browser's "paste and match style" instead of the popup.

## Approach

An overlay-plugin declaration names exactly one `chord`, but the shared seam already publishes a *list* of chord ids per plugin (`OverlayClaims.chords`), and the window key handler resolves any keydown against that list. So the change is in the declaration and the host, not in routing:

- `OverlayPluginDeclaration` gains an optional `alternateChords?: readonly OverlayChord[]` — further chords that open the same overlay. It is additive, so the API version stays 1, and `chord` stays the primary chord the docs and the popup's own help name first.
- `overlay-plugins/chords.ts` gains `declarationChordIds(declaration)`, the canonical ids of the primary chord followed by the alternates. Every place that reads a declaration's chord reads this instead:
  - `validateDeclarations` refuses a declaration if *any* of its chords is already claimed by an earlier plugin, and records all of them as taken.
  - The host refuses a plugin if *any* of its chords is one the application owns, and publishes all of them as claims.
- The clipboard declaration adds `alternateChords: [{ key: 'v', meta: true, shift: true }]`.
- `isClipboardChord` in `shared/terminal/window-chords.ts`, which lets the chord bubble out of a harness terminal, accepts `Cmd+Shift+V` as well, with exactly one of Ctrl or Cmd held.

The window handler needs no change: `handleChordKeys` falls through `metaChordOpener` for a Cmd chord the application does not own and then asks the seam, which now answers `meta+shift+v`. It already calls `preventDefault` on a claimed plugin chord, which is what suppresses the browser's "paste and match style" in a text field. The editor's key table leaves `Cmd+Shift+V` unhandled, so it reaches the window handler there too.

## Implementation steps

1. `web/src/overlay-plugins/api.ts` — add the optional `alternateChords` field, documented.
2. `web/src/overlay-plugins/chords.ts` — add `declarationChordIds`.
3. `web/src/overlay-plugins/registry.ts` — check and record every chord id in `declarationFault`/`validateDeclarations`; add `alternateChords` to the clipboard declaration.
4. `web/src/overlay-plugins/host.ts` — refuse on any core-owned chord and publish every chord id as a claim.
5. `web/src/shared/terminal/window-chords.ts` — `isClipboardChord` accepts Cmd+Shift+V; update the comments in `HarnessTab.tsx` and `MountedViewLayers.tsx` that name the chord.

## Tests

- `web/src/overlay-plugins/registry.test.ts`: `declarationChordIds` lists the primary chord first, then the alternates; a declaration whose alternate collides with an earlier plugin's chord is refused; the shipped clipboard declaration also claims `meta+shift+v`; the documented example shows the alternate.
- `web/src/overlay-plugins/host.test.ts`: an alternate chord opens the overlay on its first press, like the primary; an alternate the application already owns disables the plugin at construction.
- `web/src/shared/terminal/window-chords.test.ts`: accepts Cmd+Shift+V; rejects Cmd+Shift+V with Ctrl also held, and Cmd+V without the shift.
- `web/src/useWindowKeys.test.ts`: Cmd+Shift+V opens a contributed overlay claiming `meta+shift+v` and suppresses the browser default.

## Spec and docs

- `product/specs/clipboard-history.md`, `product/specs/keyboard-navigation.md`, `product/specs/harness.md` — name `Cmd+Shift+V` beside `Ctrl+Shift+V`.
- `help.md`, `documentation/user-documentation/getting-started/keyboard.md`, `documentation/user-documentation/command-bar/clipboard.md` — the same.
- `documentation/developer-documentation/overlay-plugins.md` — the declaration example and reference table gain `alternateChords`; the v1 changelog lists it.

## Out of scope

- Rebinding or removing `Ctrl+Shift+V`.
- Platform-specific chords (Cmd on macOS only). Both chords are claimed on every platform, matching how the application's other Cmd chords are bound.
