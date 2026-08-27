# Colocate the transcript terminal card

**Complexity: 3/10** — this is a behavior-preserving move of one component and its test into the existing transcript feature, with direct import updates.

## Goal

Keep the transcript-only `TerminalCard` beside the transcript that renders it while preserving `useXterm` as a shared hook used by terminal cards, harness tabs, and shell tabs.

## Approach

Move `TerminalCard` and its test into `web/src/transcript/`. Update the component's parent-relative imports for shared client, icon, and xterm modules, and make `Transcript` import the sibling component directly.

## Implementation steps

1. Move `TerminalCard.tsx` and `TerminalCard.test.tsx` into `web/src/transcript/`.
2. Update the moved files to import shared modules from the parent directory.
3. Update `Transcript.tsx` to import `TerminalCard` from its sibling module.

## Tests

- Run the moved terminal-card tests and transcript tests through `./scripts/run.mjs check-diff`; existing coverage pins status rendering, maximize behavior, kill intent, key filtering, and transcript integration.

## Specs

- No functional spec change is needed because file placement and imports change without altering user-visible behavior.

## Out of scope

- Moving `useXterm`, which has three consumers across transcript, harness, and shell features and therefore belongs in the shared layer.
- Changing terminal rendering, PTY behavior, protocol messages, or transcript behavior.
- Introducing a barrel file for the feature.
