# PR 1129 — an empty pick claims nothing

Complexity: 3/10

## Goal

`layerHolds` returned true whenever the two range ends differed, but `layerText` returns
an empty string whenever the picked cells contain nothing — a drag through the blank
region below a shell prompt, or across trailing whitespace. The copy chord then wrote an
empty string to the clipboard, destroyed what was there, and swallowed the chord, while
the selection bridge answered "yes" to `hasSelection` with nothing behind it.

## Approach

`layerHolds` means "this pick resolves to text". The proposed `layerText(state) !== ''`
does not cover the blank-region case: a multi-blank-row range arrives as newline
separators with no text between them (`trimEnd` empties each row's slice, the join leaves
`'\n'…`). The implemented equivalent is `layerText(state).trim() !== ''`, which also
subsumes the zero-length check. One change flows to every consumer: the copy branch and
the registered `TerminalAccess` in `useXterm` both route through `selection.holds()`, so
an empty pick falls back to the emulator's own selection and, with none, lets the chord
reach the PTY unchanged.

## Implementation steps

1. `web/src/shared/terminal/terminal-selection-layer.ts`: `layerHolds` tests
   `layerText(state).trim() !== ''`.
2. Model test: a range whose rows lie past the end of the snapshot has empty text and
   does not hold.
3. Harness test: after a Shift+drag across the blank region, the copy chord returns true
   and nothing is written to the clipboard.

Out of scope: removing the overlay a blank pick shows (dismissal — including the
zero-length Shift+click — is the unfreeze entry, already delivered).
