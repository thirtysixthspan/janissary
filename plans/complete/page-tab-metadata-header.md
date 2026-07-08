# Add a metadata header with close button to page tabs

**Complexity: 3/10** — new header markup + CSS in `PageTab.tsx`/`theme.css`, one prop threaded
through `ViewTabBody.tsx`, a direct client RPC call already used elsewhere for the same purpose.

## Goal

A page tab's body should show a compact metadata line above the embedded page — the page
number, root domain, and full URL — with a close button right-aligned on that line. Clicking the
close button closes the tab directly, without requiring the tab strip's own close control.

## Background (verified)

- `web/src/PageTab.tsx` currently renders only the `<iframe>` — no metadata header exists yet,
  even though `specs/embedded-web-page.md` ("Page tab layout", lines 86-90) already documents
  that the page view should show "Metadata — the page's number, domain, and full address, in a
  compact header" above the embedded page. That header was never implemented.
- `web/src/theme.css:63` already reserves `.page-tab { ...; display: flex; flex-direction:
  column; }` — a column layout ready for a header stacked above `.page-frame` (`theme.css:64`).
- Convention for a metadata line with a right-aligned close button already exists in
  `FileTreeTab.tsx`/`theme.css` for the file-tree tab:
  - `theme.css:396-398` — `.files-header { display: flex; align-items: center;
    justify-content: space-between; padding: 6px 12px; color: var(--muted); font-size: 12px;
    border-bottom: 1px solid var(--border); }`
  - `theme.css:400-403` — `.files-meta { display: flex; flex-wrap: wrap; align-items: baseline;
    gap: 4px 16px; flex: 1; min-width: 0; }`
  - `theme.css:405` — `.files-actions { display: flex; align-items: center; gap: 2px;
    flex-shrink: 0; }` (right side, holding the close button)
  - `theme.css:406-410` — `.files-collapse-all, .files-dock-cycle, .files-close { background:
    transparent; border: none; color: var(--muted); cursor: pointer; font-size: 13px; padding:
    0 4px; line-height: 1; }` plus a `:hover` color change.
  - `FileTreeTab.tsx:133-143` — the close button itself:
    ```tsx
    <button type="button" className="files-close" title="Close" aria-label="Close tab"
      onClick={() => client.send({ method: 'closeTab', params: { index } })}>×</button>
    ```
  This is the exact RPC call needed — `client.send({ method: 'closeTab', params: { index } })` —
  a direct client→server WS call already used by `FileTreeTab` for its own close button. It does
  not go through the `CloseSaveGuard` unsaved-changes check that `App.tsx`'s `closeTab` callback
  applies for editor tabs — not relevant here since page tabs hold no unsaved state (per
  `specs/embedded-web-page.md`, a page tab "owns no shell, agent session, browser, workspace, or
  served file").
- `web/src/ViewTabBody.tsx:18-20` renders `<PageTab page={tab.page} />`, but `ViewTabBody`
  already receives `client` and `index` as props (used today only for the `files` branch,
  `ViewTabBody.tsx:24-26`) — the same values need forwarding to `PageTab`.
- The separate "right-aligned close button in the tab strip" (`specs/embedded-web-page.md`
  lines 103-114) is a different, already-implemented affordance (`TabItem.tsx`'s generic
  `.tab-close`) — this plan adds a second, independent close control inside the tab body itself,
  matching the file-tree tab's pattern, not a change to the tab strip.
- `.image-meta`/`.image-name`/`.image-loc` (`theme.css:51-53`, used by `ImageTab.tsx` and
  `EditorTab.tsx`) is the other existing metadata-line convention but has no built-in
  right-aligned action area — `.files-header`/`.files-actions` is the closer match since it
  already solves the "metadata + right-aligned button" layout this task needs.
- `PageView` type (`src/types.ts:77`): `{ url: string; domain: string; number: number }`.

## Approach

Model the new header on `.files-header`/`.files-meta`/`.files-actions`/`.files-close` rather
than `.image-meta` (which has no action-area convention). Thread `client` and `index` from
`ViewTabBody` into `PageTab`, and call the same `closeTab` RPC `FileTreeTab` already uses.

## Implementation

1. **`web/src/PageTab.tsx`** — add `client: JanusClient` and `index: number` props. Render a new
   header above the `<iframe>`:
   ```tsx
   <div className="page-header">
     <div className="page-meta">
       <span className="page-number">{page.number})</span>
       <span className="page-domain">{page.domain}</span>
       <span className="page-url">{page.url}</span>
     </div>
     <div className="page-actions">
       <button type="button" className="page-close" title="Close" aria-label="Close tab"
         onClick={() => client.send({ method: 'closeTab', params: { index } })}>×</button>
     </div>
   </div>
   ```
   Keep the existing `<iframe className="page-frame" ... />` unchanged beneath it.
2. **`web/src/ViewTabBody.tsx:18-20`** — forward `client` and `index` to `PageTab`:
   `<PageTab page={tab.page} client={client} index={index} />`. Update the file's header comment
   (currently says `client`/`index` are "only used by the files branch") since the page branch
   now uses them too.
3. **`web/src/theme.css`** — add, near the existing `.page-tab`/`.page-frame` rules
   (`theme.css:63-64`):
   ```css
   .page-header {
     display: flex; align-items: center; justify-content: space-between;
     padding: 6px 12px; color: var(--muted); font-size: 12px; border-bottom: 1px solid var(--border);
   }
   .page-meta { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 16px; flex: 1; min-width: 0; }
   .page-domain { color: var(--fg); font-weight: 600; }
   .page-url { font-size: 12px; word-break: break-all; }
   .page-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
   .page-close { background: transparent; border: none; color: var(--muted); cursor: pointer; font-size: 13px; padding: 0 4px; line-height: 1; }
   .page-close:hover { color: var(--fg); }
   ```

## Tests

Extend `web/src/PageTab.test.tsx` (following `FileTreeTab.test.tsx`'s `client`-mocking
convention: `const send = vi.fn(); const client = { send } as unknown as JanusClient;`):

1. Metadata header shows the page number, domain, and full URL.
2. Clicking the close button sends `{ method: 'closeTab', params: { index } }` with the given
   `index` prop.
3. The existing iframe `src`/`title` tests continue to pass unchanged (update their `render` call
   to pass the new required `client`/`index` props).

## Verification

Manual: open a page tab (`open https://example.com`), confirm the header shows `1) example.com`
and the full URL, and clicking the header's close button (×) closes the tab. Not runnable in this
environment — note as unverified manually if so.

## Out of scope

- The tab strip's own close button (`TabItem.tsx`'s `.tab-close`) — unchanged, already correct
  per spec.
- Any change to `ImageTab.tsx`/`EditorTab.tsx`'s existing `.image-meta` header (they are not
  page tabs and are out of scope for this issue).
- `CloseSaveGuard`/unsaved-changes handling — not applicable to page tabs.
