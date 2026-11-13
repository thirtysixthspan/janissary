# Escape bidirectional and invisible formatting controls in the mutation path display helper

**Complexity: 2/10** — ~5 added lines in one existing file, 3 requirements, 4 test scenarios (p=3.83).

Source: PR #1996 branch backlog entry "Close a security gap in the mutation path display helper". Follows `./product/plans/complete/janissary-hosted-agent-write-tool-2a-contract-and-messages.md`, which introduced `displayPath`.

## Goal

`displayPath` in `src/file-write/messages.ts` escapes C0, DEL, C1, U+2028, and U+2029 so every write and edit outcome line stays on one line. It passes Unicode bidirectional controls and invisible directional marks through raw, so an agent-chosen path containing, for example, U+202E (right-to-left override) can render in the terminal or transcript as a different-looking name than the file actually written: a Trojan Source style spoof of the line meant to tell the user what changed. Escape those code points too, so the rendered path always shows its true logical order with the controls visible.

## Approach

Extend the local `isEscapedCode` predicate with the bidirectional and invisible formatting controls, keeping the single forward scan over code points and the existing `\u` plus four lowercase hex digits rendering:

- U+061C ARABIC LETTER MARK
- U+200E LEFT-TO-RIGHT MARK and U+200F RIGHT-TO-LEFT MARK
- U+202A through U+202E (embeddings, overrides, and pop directional formatting)
- U+2066 through U+2069 (isolates and pop directional isolate)

Split the predicate into the existing line-breaking/control test and a separate bidirectional-control test so each stays readable and under the cognitive-complexity limit. No regex is introduced. Backslash, spaces, ordinary non-ASCII letters, non-BMP characters, and lone surrogates stay unchanged.

Homoglyph look-alikes are not addressed; no escaping scheme of this shape can address them.

## Implementation steps

1. In `src/file-write/messages.ts`, add a local `isBidiControl(code)` helper covering U+061C, U+200E, U+200F, U+202A–U+202E, and U+2066–U+2069, and have `isEscapedCode` return true for it as well.
2. Update the `displayPath` escaping design decision in `./product/plans/complete/janissary-hosted-agent-write-tool-2a-contract-and-messages.md` so it lists the added code points instead of saying every other code point is left unchanged.

## Tests

In `src/file-write/messages.test.ts`, under the existing `displayPath` describe:

- A path built with `String.fromCodePoint` from each of U+061C, U+200E, U+200F, U+202A, U+202B, U+202C, U+202D, U+202E, U+2066, U+2067, U+2068, and U+2069 renders each as its exact `\u` escape (`\u061c`, `\u200e`, …, `\u2069`).
- A mixed path such as `invoice` + U+202E + `fdp.exe` renders the escape `\u202e` and does not contain the raw U+202E character.
- The neighbours just outside the new ranges (U+200D, U+2010, U+2065, U+206A) are left unchanged, pinning the range edges.

The existing `displayPath` and formatter tests must keep passing unchanged.

## Specs and documentation

No functional spec or help page describes the write and edit outcome lines yet: nothing calls these formatters until the later executor plans in the series, which own the ACP, roles, and command spec updates. No spec or documentation change is made here.

## Out of scope

- Homoglyph and confusable-character detection.
- Other zero-width characters that do not affect direction (for example U+200B–U+200D, U+FEFF).
- The second backlog entry (pinning the U+2029 escape with a test).
- Wiring the formatters into executors.
