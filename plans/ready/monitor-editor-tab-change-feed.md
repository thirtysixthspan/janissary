# Feed editor-tab changes to monitors as diffs (change-only model)

**Complexity: 4/10** — one new feed module mirroring an existing one (`monitor-harness-feed.ts`), one new field on `MonitorSub`, two call sites in `monitor-manager.ts`, one new small dependency for diffing, and a spec update. No protocol/RPC change, no new grantable tool, no new persisted state (editor tabs are already memory-only).

**Depends on [[editor-live-buffer-sync]] for full freshness, but is not blocked by it.** This plan's disk-read approach (Decision 6 below) works standalone and ships real value on its own — it just can't see unsaved keystrokes. `editor-live-buffer-sync` gives the server a transient `tab.editorDraft` field; once it lands, `editorFeedEntries` should be revisited to prefer that draft over the on-disk read when it's present and newer (see that plan's Implementation order step 8). Landing `editor-live-buffer-sync` first means this plan can pick up draft-awareness immediately instead of shipping the disk-only version and coming back to it.

## Summary

Monitors today receive content from two kinds of targets: agent tabs (every `LogEntry` in the tab's transcript, streamed via the `entry:appended` bus event and re-seeded in full at monitor start) and harness tabs (the latest rendered screen, polled at seed and at each 30s flush, fed only when it has changed — see `monitor-harness-feed.ts`). **Editor tabs contribute nothing.** They have no `LogEntry` transcript (`specs/editor-tab.md`: "no shell, agent session, browser, transcript"), so a monitor targeting an editor tab directly, or a group that happens to contain one, currently sees zero content from it — `matchesTargets`/`seedEntries` only ever look at `tab.log`, which stays empty for a `view: 'editor'` tab.

This plan adds a third feed source, `monitor-editor-feed.ts`, using the same poll-at-flush shape as the harness feed rather than pushing events: read the target editor tab's file from disk at seed time and at each flush, compare it to the content last fed to *that* monitor for *that* tab, and emit a monitor entry only when it actually changed. The entry's payload is a size-capped **unified diff** against the previous content — never the whole file — so a monitor watching a large file accumulates roughly one screenful of change per edit, not the file's full size on every poll. The first time a given monitor sees a given editor tab, there is nothing to diff against yet, so that one seed entry is the full current content (mirroring how `seedEntries` gives agent-tab monitors full history on start); every entry after that is diff-only.

## Design decisions

1. **Poll-at-flush, not event-driven.** `editorFeedEntries` is called from `start()` (seed) and `flush()` (the 30s cycle) in `monitor-manager.ts`, exactly where `harnessFeedEntries` is already called — see the seed push at `monitor-manager.ts:79-82` and the flush call at `:138`. Rejected: hooking `editor-save.ts`'s save handler or `EditorWatchManager`'s external-change watcher to push events into the monitor buffer. Reading the file straight off disk at flush time picks up **both** an in-app save and an external change with one code path, since both eventually land on disk — no new event, no coupling to two unrelated subsystems, and it reuses the shape non-transcript feeds already have in this codebase (harness).
2. **Diff-only after the first feed, full content on the first.** `MonitorSub` gains `editorSeen: Map<string, string>` (tab label → last content fed to *this* monitor), mirroring `harnessSeen: Map<string, number>`. When a target tab isn't yet in the map, the whole current content is the entry (there's nothing to diff against — same reasoning as `seedEntries`' full-transcript seed). Once it's in the map, the entry is a unified diff between the cached content and the freshly read content; the cache is then updated to the new content either way.
3. **Change detection is a plain string comparison, not a hash.** File content is already read into memory to build the diff, so hashing first would only add a step, not save one (unlike the harness feed, where `capturedAt` lets it skip a screen read entirely for an idle harness). Trade-off accepted: an unchanged file still costs one `readFileSync` per flush per targeted editor tab — bounded by (open editor tabs × monitors targeting them), same order of magnitude as the harness feed's per-flush screen read.
4. **Every entry is capped; an oversized one is truncated with a note, never sent whole.** `MAX_DIFF_BYTES` is **20 KB** (a fixed module-top constant, in the spirit of the editor's own 1 MB/10,000-line syntax-highlighting cap, `specs/editor-tab.md:104`), bounding the worst case — a single edit that rewrites most of a large file. Over the cap, the entry is truncated to the limit plus a trailing `… diff truncated (N bytes total)` line, not sent whole. The cap applies equally to the first-seen **full-content** entry (Decision 2): a monitor seeding on a file larger than the cap gets its first 20 KB plus the same style of trailing note — bounded context beats complete context for an LLM feed. This is the crux of "change-only": even a change is bounded, not just "changed vs. unchanged."
5. **Diffing uses a real library, not a hand-rolled implementation.** No diff utility exists in `src/` today (confirmed: no `diff` npm dependency, no hand-rolled unified-diff function). Add the `diff` package (small, MIT, no transitive bloat) and use `createPatch(fileName, oldContent, newContent)` — pass `tab.editor.name` as the file name — for a standard unified-diff string, familiar to any LLM monitor persona and trivially truncatable by byte length. No `@types/diff` needed: `diff@9.x` ships its own type declarations (verified — the published package has a `types` field). Hand-rolling an LCS-based differ was rejected as unnecessary risk for a solved problem.
6. **Unsaved in-editor keystrokes are invisible to monitors until the file is saved — unless `editor-live-buffer-sync` has already landed.** Verified fact: the server never holds the live buffer on its own — `editor-save.ts`'s `saveFile` receives `content` as a request parameter and writes it straight to disk, discarding it immediately after (`editor-save.ts:10-23`, `writeFileSync(filePath, content, 'utf8')`); nothing server-side tracks in-progress edits. Read in isolation, this plan's feed only ever sees what's actually on disk. If [[editor-live-buffer-sync]] has been implemented first (recommended order — see the header note), `editorFeedEntries` should instead prefer `tab.editorDraft.content` (with its `updatedAt`) over the disk read whenever a draft is newer than the content last fed, closing this gap without this plan needing to build the sync mechanism itself. If that plan hasn't landed yet, this remains an accepted, documented limitation rather than a blocker — the disk-only version still delivers save-triggered visibility on its own.
7. **File reads reuse the existing allow-listed path resolution.** `editorFeedEntries` resolves each target tab's on-disk path via `managers.tab.openFilePath(id)` (`tab-manager.ts:323`), the same resolver `editor-save.ts` already uses, rather than trusting `tab.editor.path` directly or introducing a new file-access surface. `openFilePath` takes the bare id, so derive it from `tab.editor.url` exactly the way `editor-save.ts:11` does (`url.startsWith('/open/') ? url.slice('/open/'.length) : ''`). If the id doesn't resolve (`openFilePath` returns `undefined` — shouldn't happen for a live editor tab, but the map is external state), skip that tab silently rather than throwing mid-flush. This keeps principle 9 (local-first security, allow-listed file serving) intact — no new ingress is created; an existing one is read from a second call site.
8. **A missing or not-yet-created file is treated as empty content, not an error.** `edit <file>` can open a path that doesn't exist yet (`specs/editor-tab.md:38`, § New files); before the first save there is nothing on disk to read. `editorFeedEntries` treats a missing file as `''`, so a never-saved new-file editor tab simply contributes no entries (empty vs. empty is "no change") until the first save puts real content on disk, at which point it seeds like any other first-seen tab. The same rule makes deletion visible: a file that had content and then disappears from disk reads as `''`, which differs from the cached content, so the monitor receives a diff removing every line — an accurate signal that the file is gone, not an error to suppress.
9. **State lives on `MonitorSub`, not a new controller-level map.** Per architecture principle 2, `editorSeen` is added directly to the existing `MonitorSub` type (`monitor-manager.ts:22-38`) next to `harnessSeen`, not as a new `Map<label, …>` elsewhere. It needs no separate disposal — it's freed with the rest of `reg` when the monitor stops, exactly like `harnessSeen`. Two accepted trade-offs inherited from `harnessSeen`'s label-keyed semantics: an entry for a closed target tab lingers in the map until the monitor stops (bounded, harmless), and if a same-labeled editor tab later reopens while the monitor runs, its first feed is a diff against the cached content rather than a fresh full seed — which is arguably the more useful behavior anyway.

## Verified codebase facts that shape the design

- **Editor tabs have no transcript today.** `Tab.log` (`types.ts:175`) is the only channel `seedEntries`/`matchesTargets`/the `entry:appended` subscription read from (`monitor-targets.ts:16-22, 46-50`; `monitor-manager.ts:109-113`); an editor tab never appends to it, so it is currently invisible to every monitor mechanism.
- **The harness feed is the precedent to mirror.** `monitor-harness-feed.ts:12-26` (`harnessFeedEntries`): filters `resolveTargetTabs(...)` to `tab.view === 'harness'`, dedupes via a `Map<string, number>` keyed by tab label (there: capture time), and is called from both `start()` (seed) and `flush()` in `monitor-manager.ts`. `resolveTargetTabs` (`monitor-targets.ts:9-12`) itself is view-agnostic — it just resolves `MonitorTarget`s to tabs by label/group — so the `view === 'editor'` filter belongs in the new module, exactly as the `view === 'harness'` filter lives in the harness module today, not in `resolveTargetTabs`.
- **The server never caches the live editor buffer.** `saveFile(managers, url, content)` (`editor-save.ts:10`) resolves the path via `managers.tab.openFilePath` (`tab-manager.ts:323`), calls `writeFileSync(filePath, content, 'utf8')` (`editor-save.ts:14`), stats the file for size/mtime bookkeeping, and returns — `content` is never retained.
- **`mtimeMs` is watcher-driven and deliberately excludes the app's own saves.** `EditorWatchManager.check` (`editor-watch-manager.ts:64-75`) bumps `tab.editor.mtimeMs` only on an *external* on-disk change; `markSaved` (`editor-watch-manager.ts:36`, called from `editor-save.ts:21`) moves the watcher's baseline forward first so the app's own save never shows up as an "external change." This confirms `mtimeMs` is the wrong signal to poll for this feature (it would miss in-app saves entirely) — reading the file's actual content at flush time, as this plan does, sidesteps that distinction altogether and needs no changes to `editor-watch-manager.ts`.
- **No diff dependency exists.** No `diff` entry in `package.json`, no `node_modules/diff`, no hand-rolled unified-diff function anywhere in `src/`.
- **File writes in this codebase are synchronous.** `editor-save.ts` uses `writeFileSync`; `monitor-manager.flush()` is itself synchronous up to the point it calls `reg.session.prompt(...)`. `editorFeedEntries` reading with `readFileSync` keeps the same synchronous shape as `harnessFeedEntries` and avoids introducing async control flow into `flush()`.

## Proposed changes

### What already exists (reuse, don't rebuild)

| Need | Existing precedent | Location |
| --- | --- | --- |
| Resolve a monitor target list to live tabs | `resolveTargetTabs` | `monitor-targets.ts:9-12` |
| Poll-at-flush, dedupe-by-change feed shape | `harnessFeedEntries` | `monitor-harness-feed.ts:12-26` |
| Per-monitor last-seen state alongside the session | `harnessSeen` on `MonitorSub` | `monitor-manager.ts:22-38` |
| Allow-listed editor file path resolution | `managers.tab.openFilePath` | `tab-manager.ts:323` (used by `editor-save.ts`) |
| Seed-then-flush wiring site | `start()` / `flush()` | `monitor-manager.ts:79-82`, `:138` |

### 1. Add the `diff` dependency

`npm install diff`. Small, widely used, no native bindings; ships its own type declarations at 9.x, so no `@types/diff` (Decision 5).

### 2. New file — `src/monitor-editor-feed.ts`

```ts
export function editorFeedEntries(
  managers: Managers,
  targets: MonitorTarget[],
  editorSeen: Map<string, string>,
): { tabLabel: string; entry: LogEntry }[]
```

- Filters `resolveTargetTabs(managers.tab.tabs, targets)` to `tab.view === 'editor'`.
- For each, derives the open-file id from `tab.editor.url` (strip the `/open/` prefix, like `editor-save.ts:11`), resolves the on-disk path via `managers.tab.openFilePath(id)`, and reads it with `readFileSync(..., 'utf8')`, treating a read failure (missing file) as `''` (Decision 8) and an unresolvable id as skip-this-tab (Decision 7).
- Compares against `editorSeen.get(tab.label)`. Not present → entry is the full content (capped like a diff, Decision 4), if non-empty. Present and unchanged → no entry. Present and changed → entry is `createPatch(tab.editor.name, previous, current)` truncated to `MAX_DIFF_BYTES` with the truncation note if it overflows.
- Always sets `editorSeen.set(tab.label, content)` after reading, whether or not an entry was emitted for it (so unchanged reads don't leave stale state, and a truncated diff still advances the baseline to the *actual* new content, not a partial one).
- Returns `{ tabLabel, entry: { input: '', output: <content-or-diff> } }[]`, same shape `harnessFeedEntries` returns.

Stays comfortably under the 200-line limit; kept in its own file per the file-size guideline rather than folded into `monitor-harness-feed.ts` or `monitor-targets.ts`.

### 3. Wire into `src/monitor-manager.ts`

- `MonitorSub` (`monitor-manager.ts:22-38`): add `editorSeen: Map<string, string>` next to `harnessSeen`.
- `start()` (`monitor-manager.ts:72-76`): initialize `editorSeen: new Map()` in the `reg` literal; add `...editorFeedEntries(this.managers, resolved, reg.editorSeen)` to the seed push at `:79-82`.
- `flush()` (`monitor-manager.ts:132-138`): add `reg.buffer.push(...editorFeedEntries(this.managers, reg.targets, reg.editorSeen));` alongside the existing `harnessFeedEntries` call.

No other call site changes — `stop`/`respawn`/`resetContext` need no edits since `editorSeen` is freed with the rest of `reg` (Decision 9), same as `harnessSeen`.

### 4. Docs — `specs/monitoring.md`

Extend the "Transcript access" section (`specs/monitoring.md:15-19`) with a new paragraph parallel to the existing harness-view paragraph: an editor-view target has no `LogEntry` transcript, so it instead contributes its file content read from disk; the first feed to a given monitor is the full content, every one after that is a size-capped unified diff against what was last fed to *that* monitor, and an unsaved edit in the buffer is not visible until the file is actually saved. Cross-reference [[editor-tab]].

## Implementation order

1. `npm install diff`; confirm it resolves and typechecks with a throwaway `createPatch` call.
2. Build `src/monitor-editor-feed.ts` + `src/monitor-editor-feed.test.ts` in isolation (no `MonitorManager` involved yet). Model the test on `monitor-harness-feed.test.ts` (stub tabs via `as unknown as Tab`, a `Managers` literal exposing just `tab.tabs` + `tab.openFilePath`), backed by real temp files via the `mkdtempSync` pattern in `editor-save.test.ts:13-15`, since `readFileSync` runs for real. Cases: first-seen file → full-content entry; unchanged file → no entry; changed file → diff entry; oversized change → truncated entry ending in the note; never-saved missing file → no entry; existing file deleted from disk → diff-to-empty entry (Decision 8); non-editor target → ignored.
3. Add `editorSeen` to `MonitorSub` and wire the two call sites in `monitor-manager.ts` (§3).
4. Extend `monitor-manager.test.ts` with an end-to-end case using its existing machinery (`fakeSpawnFactory`, the injectable `flushMs` constructor arg, `vi.useFakeTimers` + `vi.advanceTimersByTime(FLUSH_MS)`): start a monitor targeting an editor tab, seed gives full content, an on-disk change followed by a flush yields a diff entry, an unchanged flush yields nothing.
5. Update `specs/monitoring.md` (§4).
6. `./scripts/run.mjs check-diff` after each step; leave `npm run check` for the human at the end.

## Out of scope

- **Building the live-buffer-sync mechanism itself.** That's [[editor-live-buffer-sync]]'s job (see header note and Decision 6); this plan only consumes `tab.editorDraft` once it exists, as a follow-up integration step, not as part of its own scope.
- **A dedicated fetch-on-demand tool for monitors to pull full file content on request.** Considered and rejected for this plan: monitors are tool-less by default and only ever grantable `web_search`/`web_fetch` (`specs/monitoring.md` § Persona web tools); adding a local-filesystem-read tool would be a real widening of the local-first security boundary (architecture principle 9) and needs its own threat-model pass, not a byproduct of this change. The diff-push model needs no new tool.
- **Structured/AST-aware diffs.** Plain unified text diff only; no language-aware or semantic diffing.
- **Configurable diff size cap or poll interval.** `MAX_DIFF_BYTES` and the 30s flush cadence are fixed constants for v1, matching how `MONITOR_FLUSH_MS` is already a fixed constant.

## Verification

- `./scripts/run.mjs check-diff` after each step.
- Unit tests: `npm run test:diff:server` covering the new `monitor-editor-feed.test.ts` and the extended `monitor-manager.test.ts`.
- Manual end-to-end: open an editor tab on a file, `monitor <persona> <that-tab-label>`, confirm the reporting tab's first flush reflects the full content having been sent (via the metadata line's byte counter — `contextBytes`, accumulated per flush at `monitor-manager.ts:146` and displayed per `specs/monitoring.md` § Reporting tab metadata — jumping by roughly the file's size), edit and save the file, confirm the next flush grows it by roughly the size of the edit rather than the whole file again, and confirm an external edit (via another process) is picked up the same way as an in-app save.
