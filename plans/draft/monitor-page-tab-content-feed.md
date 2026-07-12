# Feed embedded page-tab content to monitors (change-only model)

**Complexity: 6/10 (draft)** — the monitor-side wiring is nearly identical to [[monitor-editor-tab-change-feed]] (4/10): one new feed module, one new `MonitorSub` field, two call sites in `monitor-manager.ts`. What drives the number up is that a page tab's content is **not readable from anywhere the server already has it**. An editor tab's content is on disk (synchronous `readFileSync`); a harness tab's content is the rendered screen the server's screen reader already holds. A page tab is a **cross-origin `<iframe>`** in the managed Chrome window (`web/src/PageTab.tsx:23-27`, `<iframe className="page-frame" src={page.url}>`) — same-origin policy blocks both the server (Node) and the app's own React JS from reading its rendered DOM. So this plan's real work is choosing and **building a content-acquisition path** for embedded pages, and — verified below — *every* candidate path needs an out-of-band background populator feeding a per-tab cache that the (synchronous) flush then reads; there is no inline synchronous read as there is for editor/harness. The recommended path C additionally needs a **Chrome extension that does not yet exist in this tree** (`chrome-extension/` is absent — see Verified facts) plus a content script, a new RPC, and web wiring — that whole surface is the top of the range. The plan also **reverses a stated design invariant** (`specs/embedded-web-page.md`: "The app does not communicate with, control, script, or read the contents of the embedded page; it only displays it"), a product decision, not just an engineering one — see § Trust decision. It stays a draft because the acquisition path (§ The fork) needs a human call before `ready/`.

## Summary

Monitors receive content from three kinds of targets today: agent tabs (every `LogEntry`, streamed via `entry:appended` and re-seeded in full at start), harness tabs (the latest rendered screen, polled at seed and each 30s flush, fed only when changed — `monitor-harness-feed.ts`), and — once [[monitor-editor-tab-change-feed]] lands — editor tabs (file content read from disk, first feed full then size-capped unified diffs). **Page tabs (`view: 'page'`) contribute nothing.** They have no `LogEntry` transcript (`specs/embedded-web-page.md`: "no shell, agent session, browser, transcript"), so `matchesTargets`/`seedEntries` see an empty `tab.log`, exactly as for editor and harness tabs before their feeds existed.

This plan adds a fourth feed source, `monitor-page-feed.ts`, in the **same poll-at-flush, dedupe-by-change, first-feed-full-then-capped shape** as the harness and editor feeds. The only genuinely new problem is **where the page content comes from**, because — unlike disk or a server-held screen — nothing server-side holds an embedded page's content. That question is the fork below; everything downstream of "we now have this page's current text/DOM as a string" is a mechanical copy of the editor feed (Decisions carried over verbatim: diff-after-first, plain-string change detection, `MAX_*_BYTES` truncation with a trailing note, per-monitor `Map<label, string>` seen-state on `MonitorSub`, freed with `reg`).

## The fork — how does the server obtain an embedded page's content?

Three viable paths. They are **not mutually exclusive** (a phased build can ship the cheap one first), but one must be the primary target because they differ in *what content the monitor actually sees*.

| Path | What the monitor sees | Sees the user's live/authenticated view? | New surface | Works in system-default-browser fallback? |
| --- | --- | --- | --- | --- |
| **A. Server plain `fetch`** | Raw HTML of `page.url` fetched fresh by Node (no JS run) | **No** — anonymous request, no cookies/session; SPAs return a near-empty shell | Node global `fetch`, **plus** a per-tab background fetch loop + cache (fetch is async; the flush is sync — see Verified facts) | Yes (server-side, browser-independent) |
| **B. Server Playwright re-fetch** (reuse `browser.ts`) | Rendered text (`title` + `document.body.textContent`, `browser.ts:51-57`) or screenshot of a **fresh headless load** of `page.url` | **No** — separate Playwright session, own cookie jar; re-navigates, so state/scroll/timing drift from the visible tab | Reuse existing `browser.ts` (`content`/`shot`), but spawn a Chromium per capture | Yes (server-side) |
| **C. Extension content script** (postMessage → app → server) | The **actual rendered DOM the user is looking at** — their session, SPA state, current scroll — extracted in-frame and relayed | **Yes** — reads the live iframe the user sees | A **new** MV3 content script in `chrome-extension/` (which is **not present in the tree today** — Verified facts), plus a `pageSync` RPC (models `editorSync`, `protocol.ts:131`) | **No** — only the managed-Chrome path loads the extension (like the framing relaxation, `specs/embedded-web-page.md` § What renders) |

**Recommendation: build C as the primary target, with A as an optional Phase-1 stepping stone.** Rationale:

- C is the **true analog of the harness-screen feed** — it captures *what is actually on the user's screen right now*, the same principle that makes `harnessFeedEntries` feed the rendered screen rather than re-running the program. A monitor watching a page the user is reading should see that page, in the state the user has it in (logged in, scrolled, SPA-navigated), not a different anonymous fetch of the same URL. It is the only path that satisfies the "DOM point-in-time captures" bullet in `work/features.md` in the sense the user is looking at.
- A and B both fetch a *second, anonymous* copy of the URL from the server. For a logged-in dashboard, a paywalled article, or any SPA, that copy is materially different from — often uselessly emptier than — what the user sees in the tab. They answer "what does this URL return to an anonymous client," not "what is in this tab."
- A is still worth shipping first as a **lower-risk Phase 1**: it needs no extension, no content script, no RPC, and no web changes — only server-side code (a background fetch loop, a per-tab cache, and the feed module) — so it proves out the entire monitor-side feed/diff/flush wiring against a real page and delivers the "raw website content" bullet literally. Because both A and C populate a per-tab cache that the flush reads (Verified facts: the flush is synchronous, so neither can read the network/DOM inline), Phase 2 then swaps only the cache's *populator* — the feed module and `monitor-manager.ts` wiring are untouched.
- B is **not recommended**: it carries C's "wrong session" drawback *and* A's "second load" drawback, plus spawns a Chromium per capture, for no content the other two don't already give. Keep the `browser` subsystem for its existing agent-driven use.

Because C reverses a stated invariant and only works under managed Chrome, and A ships real value on its own, the concrete proposal is **Phase 1 = A, Phase 2 = C**, with the feed module reading a per-tab cache so Phase 2 only swaps the cache's populator. **This split, and whether C is in scope at all, is the open question for the human (see § Open questions).**

## Verified codebase facts that shape this plan

Checked against the tree at the time of writing; these correct or sharpen assumptions the draft was built on:

- **`chrome-extension/` does not exist in the working tree.** `main.ts:99-107` launches system Chrome with `--load-extension=${extDir}` where `extDir = path.join(import.meta.dirname, '..', 'chrome-extension')`, but that directory is **not present**, **not git-tracked**, and **not in `package.json`'s `files`** (which ships only `bin`, `dist`, `agent-names.json`, `help.md`), and there is no `existsSync` guard around the flag. The `<all_urls>` host-permission and `declarativeNetRequest` manifest that `plans/complete/embedded-page-framing.md` describes are a *proposal that is not realized here*. **Consequence for path C:** the implementer cannot assume there is an existing extension to add a content script to — path C must first create (and get shipped in `package.json` `files`) the bundled MV3 extension, or land embedded-page-framing's extension for real. This is a substantial part of path C's cost.
- **The flush path is synchronous, so no path can read content inline.** `monitor-manager.flush()` (`src/monitor-manager.ts`, `private flush(key)`) is synchronous up to `reg.session.prompt(...)`, and both existing non-transcript feeds read synchronously (`harnessFeedEntries` reads a cached screen; the editor feed uses `readFileSync`). Node's global `fetch` is **async** and is **not used anywhere in `src/` today**. Therefore path A cannot `await fetch` inside `pageFeedEntries`; it must fetch on a background timer into a per-tab cache and have the feed read that cache synchronously — structurally the same cache-then-read as path C, only the populator differs.
- **`browser content` uses `document.body.textContent`, not `innerText`.** `browser.ts:51-57`: `title = await page.title()`, `body = await page.evaluate(() => document.body?.textContent ?? '')`, combined as `` `${title}\n\n${body}` `` and truncated at `CONTENT_LIMIT = 10_000` chars (`browser.ts:25`). The spec's "body.innerText" wording (`specs/browser.md`) does not match the code. Decision 4 below is corrected to mirror the actual implementation.
- **`editorSync` is the exact precedent for `pageSync`.** The chain is: `message-handler.ts:53` (`case 'editorSync'` → `controller.syncEditorBuffer`) → `controller.ts:120` → `editor-sync.ts:10` (`tab.editorDraft = { content, updatedAt: Date.now() }`); `tab-view.ts:41` deliberately **excludes** `editorDraft` from the state sent to clients; `editor-save.ts:20` clears it on teardown. `pageSync` should mirror each of these hops.
- **`MonitorSub` currently has `harnessSeen` but not `editorSeen`.** `export type MonitorSub` is at `monitor-manager.ts:23`; `harnessSeen: Map<string, number>` at `:30`. `editorSeen` arrives only when [[monitor-editor-tab-change-feed]] lands, so `pageSeen` sits next to `harnessSeen` (and next to `editorSeen` once that plan is in). `LogEntry` is `{ input: string; output: string; … }` (`types.ts:10-12`), so the `{ input: '', output }` entry shape is correct.

## Trust decision — this reverses "the app never reads the page"

`specs/embedded-web-page.md` states plainly, twice, that the app *only displays* an embedded page and **does not read or script its contents** — a deliberate boundary, reaffirmed in § What renders ("the app only displays the page and does not read or script its contents"). Every path above breaks that boundary; C breaks it most directly by injecting a content script that reads the live DOM. This is the same class of trust decision the monitoring spec already flags for `web_fetch` personas (`specs/monitoring.md` § Persona web tools: "a fetch-enabled persona could place transcript content into an outbound request") — here, page content the user is viewing (potentially authenticated, sensitive) becomes part of a monitor's ACP context and is sent to that monitor's model.

Consequences to design around, not gloss over:

- **Scope the read to explicitly-monitored page tabs only.** Content is acquired only for a page tab that is an actual resolved target of a running monitor (`resolveTargetTabs` filtered to `view === 'page'`) — never for page tabs in general. A page tab nobody monitors is still just displayed, preserving the invariant for the default case.
- **The spec must change honestly.** `specs/embedded-web-page.md`'s "does not read" language has to be amended to "does not read the page **except when the user has explicitly attached a monitor to that page tab**," cross-referencing `monitoring.md`. Do not leave the spec asserting something the code now contradicts.
- **Sensitive-surface reality.** Unlike an editor tab (a local file the user chose to open) or a harness (a local program), an embedded page can be a live authenticated third-party session. Feeding it to an LLM monitor is a real exfiltration surface. This is arguably reason enough to gate the whole feature behind the same persona-level opt-in trust model, or to require the monitor persona to already hold `web_fetch` (i.e. "this persona is already trusted with outbound page content"). Flagged for the human.

## Design decisions (carried from the editor feed unless noted)

1. **Poll-at-flush, reading a per-tab cache — same shape as harness/editor.** `pageFeedEntries` is called from `start()` (seed) and `flush()` (30s cycle) in `monitor-manager.ts`, at the exact sites `harnessFeedEntries` is called: the seed push at `monitor-manager.ts:83-86` and the flush push at `:142`. Because the flush is synchronous (Verified facts), `pageFeedEntries` reads a **cache**, never the network or DOM directly. Both paths keep that cache fresh out of band: **path C**'s content script pushes DOM snapshots via the `pageSync` RPC on its own cadence; **path A**'s server-side background loop fetches on a timer. Either way the poll owns the flush timing and the "no new content → no ACP prompt" guarantee, exactly as the editor's `editorSync` keeps `tab.editorDraft` fresh without driving the monitor.
2. **Diff-only after the first feed, full content on the first.** `MonitorSub` gains `pageSeen: Map<string, string>` (tab label → last content fed to *this* monitor), mirroring `harnessSeen`/`editorSeen`. First feed of a given page tab to a given monitor is the full current text (nothing to diff against); every later entry is a size-capped unified diff (`createPatch`, the same `diff` dependency [[monitor-editor-tab-change-feed]] introduces — reuse it, do not add a second differ).
3. **Every entry is capped.** `MAX_PAGE_BYTES` (fixed module-top constant; start at the editor feed's **20 KB**, revisit — rendered pages can be large). The first-seen full-content entry is capped identically, with the same trailing `… truncated (N bytes total)` note. Pairs naturally with the `browser content` precedent, which already truncates rendered text to ~10k chars (`specs/browser.md` § Actions) — reuse that truncation intuition.
4. **What "content" is — mirror `browser content` exactly.** For path A: the raw response body, stripped to text. For path C: `` `${document.title}\n\n${document.body.textContent ?? ''}` ``, decided to match the real `browser content` implementation (`browser.ts:51-57`, which uses `textContent` joined with `\n\n`, **not** `innerText` as the spec's prose says) so a monitor persona reads page-tab content and `browser content` output identically. (`innerText` — visible-only rendered text — was considered and rejected here purely to keep the two surfaces identical; if a later change moves `browser content` to `innerText`, move this with it.) A full-DOM/`outerHTML` variant is **out of scope for v1** — text is what an LLM persona can use; raw markup is mostly noise and much larger.
5. **Change detection is plain string comparison, not a hash** — content is already in memory to diff; same reasoning as the editor feed.
6. **A page that hasn't reported yet contributes nothing (empty), not an error.** For C, a just-opened page tab whose content script hasn't posted a snapshot yet has no cache entry → treated as `''` → no entry until the first snapshot arrives, then it seeds like any first-seen target. For A, a fetch failure (network, non-200) reads as `''` and is skipped, not thrown mid-flush — same "missing → empty, never crash the flush" rule as the editor feed's missing-file handling.
7. **State lives on `MonitorSub`.** `pageSeen` added next to `harnessSeen`/`editorSeen`; freed with `reg` on stop; no controller-level map (architecture principle 2). Same two accepted trade-offs as `harnessSeen`: a closed target's entry lingers until the monitor stops (bounded), and a same-labeled page tab reopening mid-monitor first feeds a diff, not a fresh full seed.
8. **The content-script cache (path C) is transient server state, like `tab.editorDraft`.** A `page` tab gains an optional transient field (e.g. `tab.pageSnapshot?: { text: string; capturedAt: number }`) set by the `pageSync` handler and never persisted — modelled exactly on `editorDraft` (`types.ts:166`, "In-memory only; never sent to any client"). Deduping can then use `capturedAt` the way the harness feed uses it, so an unchanged page never re-prompts.

## Proposed changes (Phase 2 / path C shown; Phase 1 / path A is the same feed reading the same `tab.pageSnapshot` cache, with a server-side background fetch loop as the populator instead of the content script + RPC)

### What already exists (reuse, don't rebuild)

| Need | Existing precedent | Location |
| --- | --- | --- |
| Resolve a target list to live tabs | `resolveTargetTabs` | `monitor-targets.ts:9-12` |
| Poll-at-flush, dedupe-by-change feed shape | `harnessFeedEntries` / `editorFeedEntries` | `monitor-harness-feed.ts`; the editor-feed plan |
| Per-monitor last-seen state on the session | `harnessSeen` (a `Map<string, number>`) | `monitor-manager.ts:23` (`MonitorSub`), `:30` (`harnessSeen`) |
| Unified diff + `MAX_*_BYTES` truncation | `diff` dep + `createPatch` | introduced by [[monitor-editor-tab-change-feed]] (not present yet) |
| Client → server transient content push (full chain to mirror) | `editorSync` RPC → `tab.editorDraft` | `protocol.ts:131` (RPC), `message-handler.ts:53` (dispatch), `controller.ts:120` (`syncEditorBuffer`), `editor-sync.ts:10` (set), `tab-view.ts:41` (excluded from client state), `editor-save.ts:20` (cleared on teardown), `types.ts:166` (field) |
| Rendered-text definition (`title` + `document.body.textContent`, joined `\n\n`, capped 10k) | `browser content` | `src/browser.ts:51-57`, `:25` (`CONTENT_LIMIT`) |
| Seed-then-flush wiring site | `start()` seed push / `flush()` push | `monitor-manager.ts:83-86`, `:142` |

### 1. New file — `src/monitor-page-feed.ts`

```ts
export function pageFeedEntries(
  managers: Managers,
  targets: MonitorTarget[],
  pageSeen: Map<string, string>,
): { tabLabel: string; entry: LogEntry }[]
```

- Filters `resolveTargetTabs(managers.tab.tabs, targets)` to `tab.view === 'page'`.
- Reads each target's current content **synchronously from a per-tab cache** (never the network/DOM inline — Verified facts): both paths store the latest content on the tab as `tab.pageSnapshot?.text ?? ''` (path C's `pageSync` handler and path A's background fetch loop both write that same field). This keeps `pageFeedEntries` synchronous like `harnessFeedEntries`.
- First-seen (`!pageSeen.has(label)`) → full-content entry (capped), if non-empty. Unchanged → no entry. Changed → `createPatch(tab.page.domain, previous, current)` truncated to `MAX_PAGE_BYTES` with the note.
- Always `pageSeen.set(label, content)` after reading; returns `{ tabLabel, entry: { input: '', output } }[]` — same shape as the sibling feeds.

Kept under the 200-line limit in its own module per the file-size guideline.

### 2. Wire into `src/monitor-manager.ts`

- `MonitorSub` (`export type MonitorSub` at `monitor-manager.ts:23`): add `pageSeen: Map<string, string>` beside `harnessSeen` (`:30`).
- `start()`: initialize `pageSeen: new Map()` in the `reg` literal (`:77-78`, next to `harnessSeen: new Map()`); add `...pageFeedEntries(this.managers, resolved, reg.pageSeen)` to the seed push (`:83-86`).
- `flush()`: add `reg.buffer.push(...pageFeedEntries(this.managers, reg.targets, reg.pageSeen));` beside the existing `harnessFeedEntries` call (`:142`).
- No `stop`/`respawn`/`resetContext` changes — freed with `reg`.

### 3. (Path C only) Content acquisition surface

Note the precondition (Verified facts): **`chrome-extension/` does not exist in the tree**, so this is not "add a content script to the existing extension." Either create the bundled MV3 extension here (manifest with `host_permissions: ["<all_urls>"]` and a content-script entry, and add `chrome-extension` to `package.json`'s `files` so it actually ships), or gate path C on embedded-page-framing's extension landing for real first.

- **`chrome-extension/` content script**: runs only inside embedded page frames; reads `` `${document.title}\n\n${document.body.textContent ?? ''}` `` (Decision 4) on a throttled cadence plus on significant DOM mutation, and `postMessage`s it to the app's top frame keyed by the frame's URL.
- **`web/src/PageTab.tsx` / a small hook**: `PageTab` already receives the tab `index` as a prop (`PageTab.tsx:4`); add a listener that validates the `message` event's origin/shape and forwards the text via a new `pageSync` RPC.
- **`protocol.ts`**: add a `pageSync` variant to `RpcCall` (next to `editorSync`, `protocol.ts:131`) carrying the page URL and text, with the same "transient, never-persisted" doc comment `editorSync` has.
- **Dispatch + handler**: add a `case 'pageSync'` in `message-handler.ts` (beside `:53`'s `editorSync`) that calls a new controller method (mirroring `controller.syncEditorBuffer`, `controller.ts:120`) which resolves the page tab by `page.url` and sets `tab.pageSnapshot = { text, capturedAt: Date.now() }` — the exact shape `editor-sync.ts:10` uses for `editorDraft`.
- **Exclude from client state**: ensure `tab-view.ts` does **not** spread `pageSnapshot` into the state sent to clients, exactly as it deliberately omits `editorDraft` (`tab-view.ts:41`).
- **`types.ts`**: add the transient `pageSnapshot?: { text: string; capturedAt: number }` field to the tab, documented like `editorDraft` (`types.ts:166`, "In-memory only; never sent to any client").

### 4. Docs

- `specs/monitoring.md` § Transcript access: new paragraph parallel to the harness- and editor-view ones — a page-view target contributes its rendered page text; first feed full, then size-capped diffs; note the acquisition path's limits (path A: anonymous fetch, no session; path C: managed-Chrome only, live view). Cross-reference [[embedded-web-page]].
- `specs/embedded-web-page.md`: amend the "does not read or script its contents" invariant to carve out the monitored-tab case (§ Trust decision), cross-referencing `monitoring.md`.

## Implementation order

1. **Land [[monitor-editor-tab-change-feed]] first** — it introduces the `diff` dependency, `createPatch` usage, and the `MAX_*_BYTES`/first-full-then-diff pattern this plan copies. Building on it avoids duplicating the differ and keeps the two feeds visibly parallel.
2. **Phase 1 (path A):** add the `pageSnapshot` field to the tab (`types.ts`), then build `monitor-page-feed.ts` reading `tab.pageSnapshot` + its `monitor-page-feed.test.ts`, modelled on `monitor-harness-feed.test.ts` (stub tabs carrying a `pageSnapshot`, no network in the feed test). Cases: first-seen → full; unchanged → none; changed → diff; oversized → truncated-with-note; empty/absent snapshot → skipped; non-page target → ignored. Add the server-side background fetch populator that writes `tab.pageSnapshot` on a timer (its own module + test, network stubbed). Wire the two `monitor-manager.ts` call sites and add an end-to-end case there (`fakeSpawnFactory`, injectable `flushMs`, fake timers) exactly like the editor plan's step 4.
3. **Phase 2 (path C):** add the content script + `pageSync` RPC + dispatch/handler/`tab-view` exclusion (§3). This only changes what *writes* `tab.pageSnapshot` (content script instead of the background fetch loop); `pageFeedEntries` and the `monitor-manager.ts` wiring are untouched, so the Phase 1 feed tests stay green. Add handler/RPC tests mirroring the `editorSync` handler tests.
4. Spec updates (§4). `./scripts/run.mjs check-diff` after each step; leave `npm run check` for the human.

## Out of scope

- **Full-DOM / `outerHTML` / structured-DOM capture.** v1 is `title` + `document.body.textContent` (Decision 4); rich DOM/AST snapshots are a separate feature.
- **Screenshots into a monitor's context.** Monitor ACP prompts are text; feeding images is a different capability (and `browser shot` already covers agent-driven screenshots).
- **Path B (Playwright re-fetch) as the primary source** — kept only as a rejected option for the record.
- **Configurable cap or cadence** — `MAX_PAGE_BYTES` and the 30s flush are fixed constants, matching `MONITOR_FLUSH_MS`.
- **Reading page tabs that are not explicit monitor targets** — the invariant holds for unmonitored pages (§ Trust decision).

## Open questions (resolve before promoting to `ready/`)

1. **Is path C (extension content script, reads the live authenticated view) acceptable given it reverses the "app never reads the page" invariant?** Or does the trust cost mean we ship only path A (anonymous fetch), accepting that monitors won't see logged-in/SPA content? This is the central decision.
2. **Should the whole feature be gated behind persona trust** — e.g. only personas that already opt into `web_fetch` may target a page tab — mirroring how `web_fetch` is already treated as a real trust decision?
3. **Phase 1 alone (path A) — is anonymous raw content useful enough to ship on its own,** or is it misleading enough (empty SPA shells, login walls) that we should hold the feature until C is ready?

## Verification

- `./scripts/run.mjs check-diff` after each step; `npm run test:diff:server` for the new feed + manager tests.
- Manual (Phase 1): `open https://example.org`, `monitor <persona> <that-page-tab>`, confirm the reporting tab's byte counter jumps by ~the page's text size on first flush, then grows by ~the change on a page that updates.
- Manual (Phase 2): open an authenticated page, confirm the monitor sees the logged-in content (not an anonymous shell), and confirm an unmonitored page tab produces no `pageSync` traffic and no reads.
