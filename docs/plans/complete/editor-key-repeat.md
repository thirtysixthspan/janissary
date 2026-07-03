# Editor key repeat

**Complexity: 4/10** — add a single default case to `plainAction` in `keys.ts`, update one test; no new modules.

## Goal

Pressing and holding a printable key in the editor repeats the key. Currently, holding a key does nothing after the first character — particularly on macOS, where the "Press and Hold" feature (accent picker) intercepts the held key in the native textarea and suppresses repeat events.

## Background

The editor uses a hidden `<textarea>` to capture keyboard input. Printable characters flow through a two-tier system:

- **Special keys** (Backspace, arrows, Enter, Tab, etc.) are intercepted by `actionForKey()` in `keys.ts`, `preventDefault()` suppresses the textarea's native behavior, and the action is applied directly to the editor model.
- **Printable characters** (letters, digits, symbols) are intentionally NOT intercepted — `actionForKey()` returns `null`, `preventDefault()` is NOT called, and the character flows through the textarea's native `input` event. The `flushTextarea()` handler reads the textarea's value and inserts it into the editor model.

On macOS, the native Press-and-Hold behavior in `<textarea>` elements opens an accent picker when a character key is held, suppressing repeat `keydown`/`input` events. Since the editor does not call `preventDefault()` for printable characters, the OS's Press-and-Hold kicks in and no repeat events are generated.

The `KeyAction` type and `apply` function already support `{ kind: 'insert', text: string }` for character insertion — Enter and Tab use it. The only missing piece is that `plainAction()` does not route single printable characters to an insert action.

## Approach

In `plainAction()` in `keys.ts`, add a default case that captures single-character printable keys (`e.key.length === 1`) and returns `{ kind: 'insert', text: e.key }`. This causes `onKeyDown` to call `preventDefault()`, which suppresses the macOS Press-and-Hold feature and allows the browser to generate repeat `keydown` events. Each repeat event is processed by the same path, producing repeated character insertion.

All existing safeguard paths remain intact:
- IME composition is protected by the `isComposing` check in `onKeyDown`, which returns before `actionForKey`
- Paste (`Cmd+V`) still returns `null` from `metaAction`, flowing through the textarea
- Ctrl/Meta/Alt combos hit their respective handlers before `plainAction`

## Implementation steps

1. **Handle printable chars in `plainAction`** — change the `default` case in `plainAction()` from `return null` to check `e.key.length === 1` and return `{ kind: 'insert', text: e.key }` when true.
2. **Update `keys.test.ts`** — change the "leaves printable characters to the hidden textarea" test to verify that single printable chars now produce `{ kind: 'insert', text: e.key }` and that Cmd+V (paste) still returns `null`.
3. **Run `./scripts/run.mjs check-diff`** after each change.

## Testing

- `web/src/editor/keys.test.ts` — update the "leaves printable characters..." test: single printable chars now return `{ kind: 'insert', text: 'a' }`; Cmd+V still returns `null`; Alt+letter still returns `null` (altKey check in `actionForKey` returns early before `plainAction`).
- Add a test case for repeat behavior in `web/src/EditorTab.test.tsx` — simulate two `keyDown` events for the same printable key and verify that two characters are inserted.

## Out of scope

- The textarea-based paste flow — `Cmd+V`, right-click paste, and programmatic paste continue to use the textarea's `onInput` event.
- IME composition — unchanged; the `isComposing` guard in `onKeyDown` continues to return early before `actionForKey`.

## Verification

`./scripts/run.mjs check-diff` must pass clean. Manual: open an editor tab, press and hold a letter key — the character should repeat in the editor buffer.
