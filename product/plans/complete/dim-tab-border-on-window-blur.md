# Dim tab group-color border when the window loses focus

**Complexity: 3/10** — a small `useEffect`-based hook plus a one-line style change threaded through two components; no server/protocol changes.

## Goal

When the janus window itself loses OS-level focus — the user switched to another application, or (in a browser) to another browser tab — every tab's colored group-color border in the tab strip dims slightly. It returns to full strength as soon as the window regains focus. This gives a quiet visual cue that keyboard input isn't currently going to janus at all, distinct from which in-app tab is active.

This is **not** about in-app tab switching. `tabs.md` already specifies that the group-color border is "drawn at full strength on every tab in the group — active or inactive, never faded" — that invariant is unchanged. The new dimming is a uniform, window-focus-driven effect applied equally to every tab, on top of that existing rule.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Tab border color render (inline style) | `web/src/TabItem.tsx:38` (`style={{ borderTopColor: tab.groupColor }}`) |
| Tab strip (renders each `TabItem`) | `web/src/TabStrip.tsx` |
| Existing window-level event-listener hook pattern (`addEventListener`/cleanup in a `useEffect`) | `web/src/useFocusOnTabSwitch.ts`, `web/src/useFileTreeDrag.ts:104` (`blur` listener) |
| Where hooks are wired into the app | `web/src/App.tsx` (imports hooks near top, calls them in the component body, passes results to `TabStrip` at `:151`) |
| Tab grouping / border spec | `product/specs/tabs.md` ("Tab grouping" section) |

## Approach

Add a `useWindowFocus` hook that tracks `document.hasFocus()`, updated via `window` `focus`/`blur` listeners. `App.tsx` calls it once and passes the boolean into `TabStrip`, which forwards it to every `TabItem`. `TabItem` computes the border color in JS: full `tab.groupColor` when focused, or a CSS `color-mix()` blend (60% original color, 40% transparent) when not — no new CSS classes or custom properties needed, since the color is already set via inline style.

## Implementation steps

1. **`web/src/useWindowFocus.ts` (new file)** — a hook returning `boolean`:
   ```ts
   import { useEffect, useState } from 'react';

   // Tracks OS-level focus of this window — lost when switching to another application or
   // (in a browser) another tab. Distinct from which in-app tab is active.
   export function useWindowFocus(): boolean {
     const [focused, setFocused] = useState(() => document.hasFocus());

     useEffect(() => {
       const onFocus = () => setFocused(true);
       const onBlur = () => setFocused(false);
       globalThis.addEventListener('focus', onFocus);
       globalThis.addEventListener('blur', onBlur);
       return () => {
         globalThis.removeEventListener('focus', onFocus);
         globalThis.removeEventListener('blur', onBlur);
       };
     }, []);

     return focused;
   }
   ```

2. **`web/src/TabItem.tsx`** — add an optional `windowFocused` prop (default `true`, so every existing call site that omits it keeps today's full-strength border), and compute the border color:
   ```ts
   type Properties = TabItemActions & {
     tab: TabView;
     index: number;
     active: boolean;
     windowFocused?: boolean;
   };

   export function TabItem({ tab, index, active, onSelect, onClose, onRename, tabNameMaxLength, onFocusCommandBar, windowFocused = true }: Properties) {
     ...
     const borderColor = windowFocused ? tab.groupColor : `color-mix(in srgb, ${tab.groupColor} 60%, transparent)`;

     return (
       <div
         className={`tab${active ? ' active' : ''}`}
         style={{ borderTopColor: borderColor }}
         ...
   ```

3. **`web/src/TabStrip.tsx`** — accept and forward the same optional prop:
   ```ts
   type Properties = TabItemActions & {
     tabs: TabView[];
     activeTab: number;
     windowFocused?: boolean;
   };

   export function TabStrip({ tabs, activeTab, onSelect, onClose, onRename, tabNameMaxLength, onFocusCommandBar, windowFocused }: Properties) {
     return (
       <div className="tabstrip" data-doc-shot="tab-strip">
         {tabs.map((tab, index) => (
           <TabItem
             ...
             windowFocused={windowFocused}
           />
         ))}
       </div>
     );
   }
   ```

4. **`web/src/App.tsx`** — call the hook and pass the result down. Adding these two lines pushes `App.tsx` past the 200-line `max-lines` limit (it is already at the ceiling), so first extract the five `activeTabRef`/`quitConfirmOpenRef`/`pickerOpenRef`/`routeRef`/`activeViewRef` "live ref" declarations (the block feeding `useCmdW`) into a new `web/src/useCmdWRefs.ts` hook — a cohesive, already-self-contained group, per `ai/guidelines/code-guidelines.md`'s "extract into a new module" rule. `guardRef` stays in `App.tsx` since it's used by other call sites too.
   ```ts
   // web/src/useCmdWRefs.ts
   import { useRef } from 'react';
   import type { RouteChooserView, TabView } from '@shared/protocol';

   // Live snapshot refs read by useCmdW's window keydown handler, so it never has to re-register.
   export function useCmdWRefs(
     activeTab: number,
     quitConfirmOpen: boolean,
     unsavedQuitOpen: boolean,
     pickerOpen: boolean,
     queueOpen: boolean,
     taskPickerOpen: boolean,
     profilePickerOpen: boolean,
     route: RouteChooserView | null,
     currentView: TabView['view'] | undefined,
   ) {
     const activeTabRef = useRef(activeTab); activeTabRef.current = activeTab;
     const quitConfirmOpenRef = useRef(quitConfirmOpen); quitConfirmOpenRef.current = quitConfirmOpen || unsavedQuitOpen;
     const pickerOpenRef = useRef(pickerOpen); pickerOpenRef.current = pickerOpen || queueOpen || taskPickerOpen || profilePickerOpen;
     const routeRef = useRef(route); routeRef.current = route;
     const activeViewRef = useRef(currentView); activeViewRef.current = currentView;
     return { activeTabRef, quitConfirmOpenRef, pickerOpenRef, routeRef, activeViewRef };
   }
   ```
   `App.tsx` then replaces the inline declarations with:
   ```ts
   const { activeTabRef, quitConfirmOpenRef, pickerOpenRef, routeRef, activeViewRef } = useCmdWRefs(
     activeTab, quitConfirmOpen, unsavedQuitOpen, pickerOpen, queueOpen, taskPickerOpen, profilePickerOpen, route, current?.view,
   );
   ```

   Then call the window-focus hook and pass the result down:
   ```ts
   import { useWindowFocus } from './useWindowFocus';
   ...
   const windowFocused = useWindowFocus();
   ...
   <TabStrip
     tabs={...}
     ...
     windowFocused={windowFocused}
   />
   ```

## Tests

- **`web/src/useWindowFocus.test.ts` (new file)**, mirroring the render-hook style of `useFocusOnTabSwitch.test.ts`:
  - Initial value reflects `document.hasFocus()` when it returns `true`.
  - Initial value reflects `document.hasFocus()` when it returns `false`.
  - Dispatching a `blur` event on `window` flips the value to `false`.
  - Dispatching a `focus` event on `window` (after a blur) flips the value back to `true`.
  - Unmounting removes the listeners (dispatching `blur`/`focus` after unmount does not throw and has no observable effect — assert via a second render's independent state, or spy on `removeEventListener`).

- **`web/src/TabStrip.test.tsx`** — add two tests:
  ```ts
  it('dims the tab border when the window is unfocused', () => {
    const { container } = render(
      <TabStrip tabs={[makeTab()]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} onRename={vi.fn()} tabNameMaxLength={100} windowFocused={false} />,
    );
    const tabEl = container.querySelector('.tab') as HTMLElement;
    expect(tabEl.style.borderTopColor).toContain('color-mix');
  });

  it('shows the full-strength tab border when the window is focused', () => {
    const { container } = render(
      <TabStrip tabs={[makeTab({ groupColor: '#123456' })]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} onRename={vi.fn()} tabNameMaxLength={100} windowFocused />,
    );
    const tabEl = container.querySelector('.tab') as HTMLElement;
    expect(tabEl.style.borderTopColor).not.toContain('color-mix');
  });
  ```
  No changes needed to existing tests — `windowFocused` is optional and defaults to today's behavior.

## Verification

- `./scripts/run.mjs check-diff` — lints changed files, incrementally typechecks the affected web project, and runs the related web tests.
- Manual: launch the app, note the tab strip's colored top border, then switch to another application (Cmd+Tab / Alt+Tab). Confirm the border dims slightly on every tab, and returns to full strength when janus regains focus. If manual verification isn't possible in this environment (headless), note that in the report.

## Out of scope

- Any change to in-app active/inactive tab border strength — `tabs.md`'s existing "never faded" rule for group membership stays exactly as-is.
- Dimming any other UI element (dot color, tab text, background) — only the group-color border.
- Persisting or configuring the dim amount; the 60%/40% blend is a fixed constant.
