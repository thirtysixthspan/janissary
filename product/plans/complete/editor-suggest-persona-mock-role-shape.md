# Update editor-suggest test mocks to the role-based Persona shape

**Complexity: 1/10** — test-fixture-only change: 0 added production lines, 0 production files edited, 6 requirements, no new tests (p=2.95)

## Goal

The AI personas change removed `harness` and `tools` from the `Persona` contract in `src/personas.ts`, leaving `{ name, role, body }`, and the loader no longer returns those fields. `src/editor-suggest/handler.test.ts` still builds its `loadPersona` mocks in the deleted `{ name, harness, body, tools }` shape. This plan replaces every such fixture with the role-based shape so the mocks match the live type and stop teaching contributors an obsolete contract. No application behavior changes.

## Requirements

1. "Replace every `mocks.loadPersona.mockReturnValue(...)` fixture in `src/editor-suggest/handler.test.ts`" — after the change, no `loadPersona` mock fixture in that file carries a `harness` or `tools` property.
2. "with `{ name: 'reviewer', role: 'ask', body: 'Watch for bugs.' }`, dropping the `harness` and `tools` fields" — each updated fixture object is exactly that object, with those three fields and values.
3. "so the fixtures match the `Persona` type defined in `src/personas.ts`" — each fixture has exactly the `name`, `role`, and `body` fields that `Persona` declares.
4. "Search the whole file for fixtures still in the old shape rather than editing only the first one." — the fixture inside the `captureConnectionHook` helper and every top-level fixture are updated, not just the first one.
5. "No production code changes are needed: `src/editor-suggest/handler.ts` reads only `name` and `body`" — no file under `src/` other than `src/editor-suggest/handler.test.ts` is modified.
6. "the existing assertions must keep passing unchanged" — every assertion in the test file stays byte-for-byte the same and the suite stays green.

## Design decisions

- The repair is a test-only edit to `src/editor-suggest/handler.test.ts`; no production source is edited (linked to Assumptions 1–3).
- Each old-shape object literal is replaced whole rather than having `harness` and `tools` deleted field by field, so all nine fixtures end up identical and readable (linked to Assumption 4).
- Every test name, helper, and assertion stays unchanged; `role` is not asserted anywhere in the file, so adding it is inert (linked to Assumption 4).
- No spec or help update is made: no application behavior changes and no command, flag, or key binding is touched (linked to Assumption 5). User and developer documentation is owned by `update-documentation.md`.
- No pull request description correction is requested by the recorded entry (linked to Assumption 6).

## Preserved behavior

None found. This plan changes only test fixtures; it adds, removes, or alters no application behavior. The existing `editorSuggest` assertions are named and pinned in Requirements 6 and checked in Verification rather than listed here.

## Assumptions

1. The `Persona` contract is `{ name, role, body }` — `src/personas.ts:13` (`export type Persona = {`), `src/personas.ts:14` (`name: string;`), `src/personas.ts:15` (`role: string;`), and `src/personas.ts:16` (`body: string;`).
2. `loadPersona` returns only those three fields — `src/personas.ts:36` (`return { name, role, body };`).
3. `editorSuggest` reads only the persona's name and body — `src/editor-suggest/handler.ts:43` (`const persona = loadPersona(match, 'editor');`), `src/editor-suggest/handler.ts:45` (`persona.name`), and `src/editor-suggest/handler.ts:72` (`[persona.body, HUNK_FORMAT, bufferBlock]`).
4. The old shape appears in nine fixtures and no assertion reads `harness` or `tools` — `src/editor-suggest/handler.test.ts:58`, `:83`, `:113`, `:129`, `:163`, `:183`, `:223`, `:242`, and `:259`, with the assertions running from `:67` to `:273`.
5. No spec under `product/specs/` describes these test mocks or the removed persona fields, and no page under `help/` describes them.
6. The recorded backlog entry's Proposal asks for no change to the pull request description.

## Existing functionality

1. The `Persona` type that the fixtures must match — `src/personas.ts:13` (`export type Persona = {`).
2. The `loadPersona` loader that produces the role-based shape — `src/personas.ts:25` (`export function loadPersona`).
3. The hoisted mock object supplying `loadPersona` to the test — `src/editor-suggest/handler.test.ts:5` (`const mocks = vi.hoisted`).
4. The existing `editorSuggest` test suite that must keep passing — `src/editor-suggest/handler.test.ts:41` (`describe('editorSuggest'`).

## Implementation steps

1. In `src/editor-suggest/handler.test.ts`, replace each of the nine `mocks.loadPersona.mockReturnValue({ name: 'reviewer', harness: { harness: 'claude', model: 'sonnet', variant: 'default' }, body: 'Watch for bugs.', tools: [] })` object literals — at lines 58, 83, 113, 129, 163, 183, 223, 242, and 259 — with `mocks.loadPersona.mockReturnValue({ name: 'reviewer', role: 'ask', body: 'Watch for bugs.' })`, leaving the surrounding test bodies and all assertions untouched. After the edit, read the whole file to confirm no fixture still contains `harness` or `tools`. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. No user-visible surface is added or changed. The change edits only test fixtures; no component, style, badge, layout, or key binding is touched.

## Tests

This plan changes only test fixtures and introduces no application code or behavior, so no new tests are added. The existing `editorSuggest` suite in `src/editor-suggest/handler.test.ts` must keep passing with every assertion unchanged; correctness is confirmed by the reading-based check in Verification rather than by new tests.

## Out of scope

- No production code changes: `src/editor-suggest/handler.ts`, `src/personas.ts`, and the persona loader stay exactly as they are.
- No spec file update: the change alters no application behavior and no spec describes these test mocks. User and developer documentation is owned by `update-documentation.md`.
- No help page changes; no command, flag, or key binding is touched.
- No edits to `documentation/user-documentation/` or `documentation/developer-documentation/`.
- No change to the pull request title or description.
- No other backlog entries.

## Verification

End with `$janissary/scripts/run.mjs check-diff`. For a reading-based check, open `src/editor-suggest/handler.test.ts` and confirm that no `mocks.loadPersona.mockReturnValue(...)` fixture contains `harness` or `tools`, that all nine fixtures read `{ name: 'reviewer', role: 'ask', body: 'Watch for bugs.' }` including the one inside `captureConnectionHook`, and that every assertion is unchanged from the original. Cross-check `src/personas.ts:13` (`export type Persona = {`) to confirm those three fields are exactly the declared contract. Any surviving old-shape fixture or any changed assertion means the change was not made correctly.
