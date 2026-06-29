# Image tab zoom

## Goal

Let the user zoom an image tab in and out:

- **Up arrow** / **scroll-wheel up** → zoom in (more).
- **Down arrow** / **scroll-wheel down** → zoom out (less).
- **Escape** → reset zoom to 100%.
- While zoomed (≠ 100%), show the current **zoom percentage** on the view.

100% means the image's current **fit-to-tab** size (today's behavior); zooming scales relative to that. The feature is entirely client-side and local to the image view — no server, protocol, or controller changes.

---

## Current behavior

- `web/src/ImageTab.tsx` renders the view: a `.image-meta` header + an `.image-stage` containing a
  single `<img>`. Orientation is read on load and toggles `image-landscape` (width 100%) vs
  `image-portrait` (height 100%) — `ImageTab.tsx:8-33`.
- Fit CSS: `.image-stage { … overflow: hidden; align-items:center; justify-content:center }` and
  `.image-stage .image-landscape{width:100%;height:auto}` / `.image-portrait{height:100%;width:auto}`
  — `web/src/theme.css:48-51`.
- `ImageTab` is mounted **only while an image tab is active** (App's early return,
  `web/src/App.tsx:159-169`); the transcript is not mounted, so `transcriptReference` is null.
- The global key handler (`App.tsx:69-155`) therefore ignores **plain** ArrowUp/ArrowDown and
  **Escape** on an image tab: the route/picker modals are closed, the transcript-scroll block is
  skipped (no element — including its `Escape`→bottom jump), and tab switch/reorder require
  Ctrl/Shift. So plain arrows and Escape are free to repurpose for zoom when an image tab is active.

---

## Design

Keep zoom **local to `ImageTab`** (a `useState` zoom multiplier + its own input listeners), because the component is already scoped to "an image is showing." This avoids lifting state into `App` or touching the global key handler.

> Alternative considered: lift zoom into `App` and extend the global key handler. Rejected — it > spreads image-only behavior across the app and risks colliding with the transcript/tab bindings. > The only `App` change needed is remounting `ImageTab` per image (below).

### Zoom model
- `zoom` is a multiplier; `1` = current fit. Apply it by scaling the **rendered size**, not a CSS
  `transform`: set `width: ${zoom*100}%` for landscape (or `height: ${zoom*100}%` for portrait),
  letting the other dimension follow via `auto`. Scaling the layout box (rather than
  `transform: scale`) makes the stage's scrollbars reflect the zoomed size, giving pan-by-scrollbar
  for free.
- **Steps / direction:** Up / wheel-up increases, Down / wheel-down decreases. Arrow step `0.1`
  (10% per press; key auto-repeat handles "hold to keep zooming"). Wheel step `0.1` per event,
  direction from `sign(deltaY)` (wheel up = `deltaY < 0` = zoom in; follows the platform's scroll
  direction).
- **Clamp** to `[0.1, 8]` (10%–800%). Round the badge to whole percent (`Math.round(zoom*100)`).
- **Reset:** Escape sets `zoom` back to `1` (100%), which also hides the percent badge.

### Input handling (in `ImageTab`)
- **Keys:** a `window` `keydown` listener added in a `useEffect` (lives only while mounted). On
  `ArrowUp`/`ArrowDown` call `preventDefault()` and adjust `zoom`; on `Escape` call
  `preventDefault()` and reset `zoom` to `1`. Because the component is only mounted on an image tab
  and `App`'s handler ignores plain arrows and Escape there, the two listeners don't conflict.
- **Wheel:** attach a **native, non-passive** listener on the stage element via a ref —
  `stageRef.current.addEventListener('wheel', onWheel, { passive: false })` — *not* the React
  `onWheel` prop, which is passive and cannot `preventDefault()`. `preventDefault()` stops native
  scroll/Ctrl-zoom so the wheel only zooms the image.

### Percent indicator
- A small overlay badge in a corner of `.image-stage`, rendered only when `zoom !== 1`, reading
  e.g. `150%`. (Could also sit in `.image-meta`; an overlay keeps it visible while panning.)

### Reset on image change
- `ImageTab` is **not** remounted when switching between two image tabs (same React position, new
  `image` prop), so `zoom` would leak across images. Fix by keying the element per image in `App`:
  `<ImageTab key={current.image.url} image={current.image} />` (`App.tsx:165`). This also resets
  the existing orientation state cleanly. (Equivalently, `useEffect(() => setZoom(1), [image.url])`
  inside `ImageTab`.)

---

## Changes

### `web/src/ImageTab.tsx`
- Add `const [zoom, setZoom] = useState(1)` and `const stageRef = useRef<HTMLDivElement>(null)`.
- `useEffect` (mount): `window` `keydown` for Arrow up/down **and Escape (reset to 100%)** (clamp,
  `preventDefault`); native non-passive `wheel` on `stageRef` for up/down; clean up both on unmount.
- Apply zoom to the `<img>` size: e.g. `style={{ width: orientation==='image-landscape' ? `${zoom*100}%` : undefined, height: orientation==='image-portrait' ? `${zoom*100}%` : undefined }}` (or compute a className/inline style pair). Keep the orientation `onLoad` logic.
- Render the percent badge when `zoom !== 1`.
- Put `ref={stageRef}` on the `.image-stage` div.

### `web/src/theme.css`
- `.image-stage`: change `overflow: hidden` → `overflow: auto` so a zoomed image can be panned via
  scrollbars. Replace flex centering with **scroll-safe** centering so you can scroll to every edge
  when zoomed in (flex `center` clips the start edge): use `justify-content: safe center;
  align-items: safe center` (or give the `<img>` `margin: auto`).
- Keep the base fit rules; the inline `width/height: ${zoom*100}%` overrides the fixed `100%` when
  zoomed.
- Add `.image-zoom-badge` (absolute, corner of the stage; subtle background, `var(--fg)` text,
  small radius/padding, `pointer-events:none`). `.image-stage` needs `position: relative`.
- Run `npm run lint:css` (stylelint is enforced).

### `web/src/App.tsx`
- Add `key={current.image.url}` to `<ImageTab>` (`:165`) to reset zoom/orientation per image.
- No change to the global key handler — plain arrows are unused on image tabs (documented above).

### Docs/spec (do as part of the change)
- Update the **Image sizing** section of `spec/open.md` to describe zoom: Up/Down and wheel
  up/down control zoom (up = more), 100% = fit, and the percent indicator shown while zoomed.

---

## Gotchas
- **Passive wheel:** React `onWheel` is passive → `preventDefault()` is ignored; use a native
  `addEventListener('wheel', …, { passive:false })` on the stage ref.
- **Flex centering clips overflow:** with `overflow:auto`, plain `justify-content:center` makes the
  top/left of a zoomed image unreachable; use `safe center` or `margin:auto` on the image.
- **Zoom leak across images:** without the `key`/reset, switching image tabs keeps the prior zoom.
- **Layout scaling vs transform:** scale `width/height` (not `transform: scale`) so scrollbars
  track the zoomed size.
- **Auto-repeat:** holding an arrow fires repeated `keydown`s — fine for "keep zooming"; ensure
  each step clamps so it saturates at the limits.

---

## Testing (`web/src/test/`, cf. `TabStrip.test.tsx`)
- ArrowUp increases zoom and shows the badge (`150%`); ArrowDown decreases; both `preventDefault`.
- Wheel up zooms in / wheel down zooms out (dispatch a `wheel` event with `deltaY` ±).
- Clamps at 10% and 800%.
- Badge hidden at 100%, shown otherwise; text = rounded percent.
- Zoom resets when the `image.url` key changes.
- Escape resets zoom to 100% (badge hidden) and `preventDefault`s.

Run `npm run check` (typecheck + lint + test + lint:css + quality + duplication + knip).

---

## Out of scope / future
- Drag-to-pan (panning is via scrollbars for now).
- A double-click reset and an explicit fit/100%-of-natural toggle (Escape already resets zoom).
- Pointer-anchored zoom (zoom toward the cursor) rather than center-anchored.
- Carrying zoom into the embedded **page tab** (see `embedded-web-page.md`) — different view.

## Checklist
- [ ] `web/src/ImageTab.tsx` — zoom state, key + non-passive wheel listeners, sized `<img>`, badge, `stageRef`
- [ ] `web/src/theme.css` — stage `overflow:auto` + safe centering + `position:relative`; `.image-zoom-badge`
- [ ] `web/src/App.tsx` — `key={current.image.url}` on `<ImageTab>`
- [ ] `spec/open.md` — Image sizing: document zoom controls + percent indicator
- [ ] Tests per the list; `npm run check` green
