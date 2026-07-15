# Page tab stays mounted across tab switches

**Complexity: 3/10** — moving one branch from a mount-per-render component (`ViewTabBody`) into the always-mounted layer (`MountedViewLayers`) that already exists and is used by harness/editor tabs; no new architecture.

## Goal

Switching away from a browser "page" tab (an embedded web page shown in an `<iframe>`) and back currently reloads the iframe from scratch, losing any navigation the user did inside it. Returning to a page tab should show the exact same page/scroll/navigation state it had before the switch, matching how harness and editor tabs already behave.

## Root cause

`web/src/App.tsx:163` renders the *current* tab's body via `<ViewTabBody tab={current} .../>`. `ViewTabBody` (`web/src/ViewTabBody.tsx:21`) mounts a fresh `PageTab` (`web/src/PageTab.tsx`) whenever `tab.view === 'page'`. Since only the current tab is ever passed in, switching to another tab unmounts `ViewTabBody`'s `PageTab` entirely, and switching back mounts a brand-new `PageTab` with `<iframe src={page.url}>` — the browser treats this as a fresh navigation, discarding the iframe's in-page history/scroll/form state.

Harness and editor tabs don't have this problem: `web/src/MountedViewLayers.tsx` renders **all** harness/editor tabs simultaneously, always mounted, toggling only `display: none`/`flex` based on whether each is current (see the comment at `MountedViewLayers.tsx:26`). The fix is to render page tabs the same way.

## Approach

Move page-tab rendering out of `ViewTabBody` and into `MountedViewLayers`, following the exact pattern already used for editor tabs there (map all matching tabs, filter to ones with a payload, toggle `display` by comparing to `current`). Page tabs need their real index in the server's tab list (for `closeTab`), which editor/harness tabs don't need — compute it the same way `useTabEntries.ts:12` does (`tabs.map((tab, index) => ({ tab, index }))` then filter).

## Implementation steps

1. **`web/src/MountedViewLayers.tsx`**
   - Add `import { PageTab } from './PageTab';`.
   - Add a `closeTab: (index: number) => void;` prop to `Properties` (needed by `PageTab`'s close button).
   - Add a third mapped block, after the editor block, mirroring its structure:
     ```tsx
     {tabs
       .map((t, index) => ({ t, index }))
       .filter(({ t }) => t.view === 'page' && t.page)
       .map(({ t, index }) => (
         <div
           key={t.page!.url}
           className="tab-body"
           style={{ borderLeft: `4px solid ${t.dotColor}`, display: t.label === current.label ? 'flex' : 'none' }}
         >
           <PageTab page={t.page!} closeTab={closeTab} index={index} client={client} />
         </div>
       ))}
     ```
   - Update the top-of-file comment (`:26`) to mention page tabs alongside harness/editor.

2. **`web/src/ViewTabBody.tsx`**
   - Remove the `import { PageTab } from './PageTab';` import.
   - Remove the `if (tab.view === 'page' && tab.page) { ... }` branch.
   - Update the file comment (`:10`–`:15`) to drop "page" from the list of views it renders.
   - `closeTab` becomes unused once the page branch is gone — drop it from the component's props and from the call site in `App.tsx`.

3. **`web/src/App.tsx`**
   - Pass `closeTab={closeTab}` to `<MountedViewLayers .../>` at `:168`.

## Tests

- **`web/src/MountedViewLayers.test.tsx`** — add a `makePageTab` helper mirroring `makeEditorTab`/`makeHarnessTab`, plus tests mirroring the editor-tab tests:
  - `renders page tabs`
  - `hides page tab when not current`
  - `renders page tab as flex when current`
  - `filters out tabs without page payload`
  - `wires closeTab through with the tab's real index in the full tabs array` (place the page tab second in the array so its index isn't 0, confirm `PageTab`'s close button calls `closeTab` with that index)
- **`web/src/ViewTabBody.test.tsx`** — remove the three page-specific tests (`returns null when view is page but no page payload`, `renders PageTab when view is page with payload`, `wires closeTab through to the PageTab close button`), since `ViewTabBody` no longer handles the `page` view. Keep the rest of the file's tests intact — `ViewTabBody` still returns `null` for `page` tabs the same way it does for other views it doesn't own (the assertion is unchanged for viewers of that view, it just falls through to the final `return null`).

## Out of scope

- Any other view kind (`image`, `markdown`, `files`, `notifications`) that currently unmounts on tab switch. The issue specifically describes losing "navigation" in a "web view," which only applies to the iframe-backed page tab.
- Persisting page-tab state across app restarts/reconnects — this is purely about not unmounting during in-session tab switches.

## Verification

- `./scripts/run.mjs check-diff`
- Manual: not verifiable in this environment (no browser to open a page tab, switch tabs, and confirm iframe state survives); the automated tests above cover the mount/hide behavior directly.
