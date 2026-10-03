# Keep the asciicast player's keyboard chords after the recording is clicked into

Complexity: 2/10

## Goal

Make every chord the player documents — Space and `p`, `.`, `,`, `[` and `]` — keep working after the recording itself has been clicked, which is the first thing a user does with a player.

## Background

A click inside the recording focuses the textarea xterm keeps hidden for composition, so `document.activeElement` becomes `TEXTAREA.xterm-helper-textarea`. The key handler in `web/src/plugins/asciicast/AsciicastTab.tsx` refuses any key whose target is an `INPUT` or a `TEXTAREA`, and that guard cannot tell the terminal's own helper textarea from a field a person is typing into. Once the recording has been clicked, no chord works again for the life of the tab — the play button stays where it was and the clock drifts forward with untouched playback.

The same guard has a second consequence: it treats *every* `<input>` as text entry, so the seek bar (`input[type=range]`) swallows chords while it holds focus.

## Approach

Use the predicate the application already has. `web/src/shared/text-entry.ts` answers "is this a place typed text can go" correctly — it treats a range input and a button as not, a textarea and a text-ish input as yes — and it is already shared by the context menu, the paste capability, and the overlay-focus seam. A client tab plugin cannot import it directly: `eslint.plugin-boundaries.mjs` allows a plugin `../api`, `../shared.css`, and its own `@shared/plugins/<id>/shared`, and nothing else.

So publish `isTextEntryElement` through `web/src/plugins/api.ts`, on the same additive terms as the components and helpers that file already carries for the same reason, and in `onKey` ignore a key only when its target is a real text entry that is not xterm's helper textarea.

The exemption is scoped to that one class name deliberately. The player has no field of its own, so the only textarea inside it is the one xterm created for it; anything else that is genuinely a text entry still holds its chords.

## Implementation steps

1. Re-export `isTextEntryElement` from `web/src/plugins/api.ts`, with the reasoning the surrounding exports carry. Additive, so `TAB_PLUGIN_API_VERSION` does not move.
2. Replace the tag-name guard in `AsciicastTab`'s `onKey` with `isTextEntryElement(target)` plus the `.xterm-helper-textarea` exemption, and say in the existing comment why the terminal's own textarea is not a text entry.

## Tests

- With xterm's helper textarea focused, `.` steps — the transport offers Play and the position advances — and Space toggles playback. This is the case the guard was written to protect, except the player has no field to protect.
- With the seek bar focused, `]` still cycles the speed, which the old guard refused.
- A real text field inside the tab still holds its chords, so the exemption cannot be widened by accident.
- The chords stay unclaimed while the tab is hidden — the existing case, unchanged.

## Out of scope

- Registering the player's terminal with the shared terminal-selection registry so `isInsideTerminal` covers it. The paste path already exempts the terminal's own textarea by name for the same reason, and a plugin's terminal is not registered there.
- Any change to which keys are chords, or to the terminal underneath, which claims none of them.