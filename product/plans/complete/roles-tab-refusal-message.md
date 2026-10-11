# Show a role edit's refusal in the roles tab

**Complexity: 3/10** — a single client-side state for the message a rejected intent already carries, rendered in the existing problem line's place, plus tests; no server change, no new file over the limit, and every editing control shares one `raise`.

## Goal

The roles tab currently raises every editing intent through a helper that discards the returned promise. The client capability in `web/src/plugins/api.ts` throws when the server answers a rejection (`A role named "<name>" already exists.`, `roles.json at <path> is unusable — fix the file before editing roles.`, `Could not write roles.json at <path>.`), and nothing catches it, so a refusal is invisible: the payload never changes and the tab appears to do nothing. The spec, the PR description, and the user page all promise those messages are shown. This fix surfaces them.

## Approach

One place catches the rejection and records its message; the tab renders it beside the payload's own problem line and clears it on the next edit attempt or success. `RoleCard` receives the same setter through a prop rather than a second copy of the catch, so every editing control shares the one path.

## Implementation

1. **`web/src/plugins/roles/RolesTab.tsx`** — add `const [refusal, setRefusal] = useState<string | null>(null)`. Change `raise` to clear the refusal and then `void capabilities.intent(intent, value).catch((error: unknown) => setRefusal(String(error instanceof Error ? error.message : error)))`. Pass `onRefusal={setRefusal}` to each `RoleCard`. Render `{refusal ? <div className="roles-refusal">{refusal}</div> : null}` directly under the existing problem line, so the two never compete for the same element.
2. **`web/src/plugins/roles/RoleCard.tsx`** — add an `onRefusal: (message: string) => void` prop; replace the local `raise` with one that calls `void capabilities.intent(intent, payload).catch(...)` and hands the message to `onRefusal`. Every existing call site (`rename-role`, `describe-role`, `delete-role`, `add-entry`, `set-entry-effort`, `remove-entry`) is unchanged in shape.
3. **`web/src/plugins/roles/roles.css`** — add a `.roles-refusal` rule beside `.roles-problem`, colored with `var(--warning, var(--muted))` so it reads as distinct from the source line and the payload problem line.

The server is untouched: every message already reaches the client through the existing rejection channel, so `src/plugins/roles/activate.test.ts` and the shared guards keep passing as they are.

## Tests

`web/src/plugins/roles/RolesTab.test.tsx`:

- extend the fake `capabilities.intent` so a test can make one named intent reject, then assert the rejection's message appears in a `.roles-refusal` element;
- assert a rejected rename, a rejected add, and a rejected write each surface their server message;
- assert a refusal clears when the next edit succeeds;
- assert the payload's own `problem` line and a refusal can both be present and render in their own elements.

The existing cases in that file (render, wording, every editing control's intent) must keep passing unchanged.

## Out of scope

- Changing which requests the server refuses or the wording it refuses with — every message already exists.
- Showing a refusal anywhere other than the roles tab, or surfacing it in the transcript.
- Deduplicating an identical message shown twice in a row.
- The other recorded entries (the partly-damaged-file rewrite, the out-of-catalog effort option, and the shared config-file module), which are worked separately.