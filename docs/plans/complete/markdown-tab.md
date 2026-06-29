# Markdown preview tab (`open <file>.md`)

## Goal

`open notes.md` opens a new **markdown tab** whose body is the file rendered as formatted Markdown
(headings, lists, tables, fenced code, blockquotes, links) — a non-agent **view tab** that takes
over the tab like an image/page view, scrollable instead of pan/zoom. `open external notes.md`
hands the file to the OS viewer instead (no tab). Behavior mirrors the image tab end-to-end; only
the body content and its navigation differ.

```
open README.md            → new tab "markdown" rendering README.md, full-tab, scrollable
open docs/*.md            → one markdown tab per matching file (shared open cap)
open external README.md   → OS default viewer, no tab
# ↑/↓ scroll a line; PageUp/PageDown a page; wheel scrolls; selection highlights light-blue
```

The behavior is documented in the functional spec `spec/markdown-tab.md` (already written).

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Opener registry + dispatch (add one module, registry never changes) | `src/openers/index.ts` (`openers[]`, `openerForExtension`), `src/controller.ts:571` (`openOne`) |
| Image opener to mirror (`inline`/`external`, `humanSize`) | `src/openers/image.ts` |
| `OpenContext` capabilities (note / openImageTab / registerFile / openExternally) | `src/openers/types.ts` |
| File serving: register → token-guarded `/open/<id>` route | `src/controller.ts:597` (`registerFile`), `:604` (`openFilePath`), `src/index.ts:52-62`; MIME map `src/index.ts:15` |
| View-tab data model (`Tab.view`, payload, `title`) | `src/types.ts:59-106` (`ImageView`, `Tab`) |
| Tab factories | `src/tab.ts:66` (`makeImageTab`), `:75` (`makePageTab`) |
| Open-a-view-tab controller glue (placement, color, focus, unique label) | `src/controller.ts:610` (`openImageTab`), `:624` (`uniqueImageLabel`); close cleanup `:1049` |
| Wire types (re-export + `TabView`) | `src/protocol.ts` |
| Markdown render (marked + DOMPurify, sanitized) — **already in the web** | `web/src/Transcript.tsx:11-21`; deps `marked`, `dompurify` in `package.json` |
| Image-tab web component to mirror (key/wheel handlers, token'd URL) | `web/src/ImageTab.tsx` |
| App render dispatch + `isViewTab` | `web/src/App.tsx:165-194` |
| View-tab CSS (`.image-tab/-meta/-stage`) and existing markdown element styling | `web/src/theme.css:44-55`, `:108-135` |
| Opener + view-tab test patterns | `src/openers/image.test.ts`, `web/src/ImageTab.test.tsx` |

## Design decision

**Serve the file text via the existing `/open/<id>` route** (mirror image bytes), rather than
embedding the Markdown in application state. The client fetches the text once by reference; the
state broadcast (`emitState`, re-sent on every change) stays small. This is the more consistent
choice and matches "similar to an image tab."

**Appearance** (resolved with the user; the todo's "white text" was a typo): white paper
background, near-black text, light-blue text selection.

**Navigation** is true document scrolling (arrows = line, PageUp/PageDown = page, wheel = native
`overflow:auto`) — distinct from the image tab's pan/zoom; do **not** hijack the wheel.

## Data model

- `src/types.ts`: add `MarkdownView` (same shape as `ImageView`):
  ```ts
  export type MarkdownView = { name: string; path: string; size: string; url: string };
  ```
  widen `Tab.view` to `'agent' | 'image' | 'page' | 'harness' | 'markdown'`; add
  `markdown?: MarkdownView` to `Tab`.
- `src/protocol.ts`: re-export `MarkdownView`; add `markdown?: MarkdownView` and `'markdown'` to the
  `TabView.view` union.

## Server changes

1. **`src/openers/markdown.ts`** (new) — mirror `src/openers/image.ts`:
   - `name: 'markdown'`, `extensions: ['.md', '.markdown']`.
   - `inline`: compute basename + size, then
     `context.openMarkdownTab({ name, path: file, size, url: context.registerFile(file) })`.
   - `external`: `context.openExternally(file)` with the same note pattern as image.
   - Extract `humanSize` out of `image.ts` into a shared `src/openers/size.ts` and import it in both
     (avoids the duplication the dup-linter flags).

2. **`src/openers/index.ts`** — import and add `markdown` to `openers[]` (one line each).

3. **`src/openers/types.ts`** — add `openMarkdownTab: (view: MarkdownView) => void` to `OpenContext`;
   import `MarkdownView`.

4. **`src/controller.ts`**:
   - `view()` (~`:138`): add `markdown: t.markdown` to the emitted tab.
   - `OpenContext` glue (~`:543`): add `openMarkdownTab: (v) => this.openMarkdownTab(v)`.
   - Add private `openMarkdownTab(view)` + `uniqueMarkdownLabel()` mirroring `openImageTab` /
     `uniqueImageLabel` (`:610`–`:630`): `insertTabInGroup`, `distinctColor`, focus, `emitState()`.
   - Close cleanup (`:1049`): also unregister the served file for markdown tabs, e.g.
     `if (tab.markdown) this.openFiles.delete(tab.markdown.url.replace(/^\/open\//, ''));`
     (or generalize the existing `tab.image` line to handle both).

5. **`src/index.ts`** — add to the `MIME` map (`:15`):
   `'.md': 'text/markdown; charset=utf-8', '.markdown': 'text/markdown; charset=utf-8'`.

## Web changes

6. **`web/src/markdown.ts`** (new) — extract the render helper from `Transcript.tsx`:
   `renderMarkdown(text: string): string | undefined` wrapping
   `DOMPurify.sanitize(marked.parse(text, { gfm: true, breaks: true, async: false }))`. Update the
   `Markdown` component in `Transcript.tsx` to call it (shared, no duplication).

7. **`web/src/MarkdownTab.tsx`** (new) — structured like `ImageTab.tsx`:
   - Read `token` from `location.search`; on mount `fetch(`${markdown.url}?token=${token}`)`,
     `.text()`, render via `renderMarkdown`, inject into a scrollable
     `<div className="markdown-stage" ref={stageRef} dangerouslySetInnerHTML=…>` (fall back to plain
     text on failure).
   - Compact `.image-meta`-style header (name / size / path) above the stage.
   - Global keydown handler: `ArrowUp/Down` → `stage.scrollTop ∓ LINE_STEP`; `PageUp/PageDown` →
     `stage.scrollTop ∓ stage.clientHeight`. No wheel handler — `overflow:auto` scrolls natively
     (do not `preventDefault`). Remove the listener on unmount.

8. **`web/src/App.tsx`** — add `'markdown'` to the `isViewTab` list (`:165`) and a render branch
   (`:171`-style): `current.view === 'markdown' && current.markdown` → `<MarkdownTab>` inside a
   `.tab-body` with the dot-color left border, keyed by `current.markdown.url`.

9. **`web/src/theme.css`** — markdown-tab styles:
   - `.markdown-stage { flex: 1; min-height: 0; overflow: auto; background: #fff; color: #1a1a1a;
     padding: 16px 20px; }` — white paper, dark text, **visible** scrollbar (do not copy the image
     stage's hidden scrollbar).
   - `.markdown-stage ::selection { background: #b3d4fc; }`.
   - Light-background variants of the rendered elements (the existing `.line.markdown code/pre/
     blockquote` use dark `--bg-soft`, wrong on white): light code/quote backgrounds, dark borders,
     readable headings/links/tables.

## Tests

- **`src/openers/markdown.test.ts`** (mirror `image.test.ts`): registry selects the markdown opener
  for `.md`/`.markdown` (case-insensitive); `inline` registers the file and calls `openMarkdownTab`
  with name/size/url; `external` invokes the OS viewer. Extend the `fakeContext` capture with
  `openMarkdownTab`.
- **`web/src/MarkdownTab.test.tsx`** (mirror `ImageTab.test.tsx`): mock `fetch` to return sample
  Markdown, assert rendered HTML appears (e.g. an `<h1>`); fire `ArrowDown` / `PageDown` and assert
  `scrollTop` grows on the stage.

## Verification

- `npm run check:diff` — lint + typecheck + server & web tests for the changed files.
- Manual: launch the app, run `open README.md`. Confirm a tab titled `markdown` opens, content
  renders on a white page with dark text, the pane shows a scrollbar and scrolls; ↑/↓ scroll a line,
  PageUp/PageDown a page, wheel scrolls; selection shows the light-blue highlight. Try
  `open external README.md` (OS viewer) and closing the tab (no leftover `/open/<id>` registration).

## Out of scope

- Relative links inside the Markdown (`![](./x.png)`) are not resolved — not requested; addable
  later by rewriting relative `src`s against a served base.
- View tabs are in-memory and not persisted (same as image/page tabs); the render is a snapshot of
  the file at open time.

## Optional follow-up

- Add a one-line mention of the Markdown opener to `spec/open.md`, alongside the image and page
  openers, so the opener registry section lists all three.
