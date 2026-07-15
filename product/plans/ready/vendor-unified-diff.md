# Vendor a unified-diff generator to replace the `diff` dependency

**Complexity: 2/10** — one small, self-contained module with a fully specified contract and two mechanical call-site swaps; no new protocol, persistence, or UI surface, and no other call sites exist to migrate.

## Why

`diff` (968K in `node_modules`) is a production dependency used for exactly one function, `createPatch`, called from exactly two call sites:

- `src/monitor/page-feed.ts:34`
- `src/monitor/editor-feed.ts:35`

Both call sites use only the 3-argument positional form — `createPatch(fileName, oldStr, newStr)` — with no options object. In both cases the returned string is never parsed back by anything in this codebase; it is capped to a byte limit (`cap()` in each file) and shown as plain text to a monitor feed (ultimately read by a human or an LLM). No round-tripping, no patch application, no options beyond the three positional args are exercised anywhere in the repo.

This plan specifies the **API contract and required behavior** a replacement module must satisfy, derived entirely from this codebase's call sites and tests — not from reading `diff`'s implementation. Whoever implements this should write the algorithm from first principles (a standard Myers-diff-style line differ + unified-format renderer) without opening `node_modules/diff` or its source repository, to keep the implementation clean-room.

## Scope

- Add a new module at **`src/monitor/patch.ts`**, exporting `createPatch` per the contract below. Both consumers (`src/monitor/page-feed.ts`, `src/monitor/editor-feed.ts`) already live in `src/monitor/`, and that directory is the established home for feed-shared helpers imported by both files (see `src/monitor/feeds.ts`, which imports `editorFeedEntries` and `pageFeedEntries` from sibling files the same way) — no other directory in the repo has a stronger claim, and no `src/monitor/patch.ts` or `src/monitor/diff.ts` currently exists to collide with.
- Update the two import lines to point at the new module instead of `diff`:
  - `src/monitor/page-feed.ts:1` — `import { createPatch } from 'diff';` → `import { createPatch } from './patch.js';` (NodeNext requires the `.js` extension on the relative import per `eslint.config.mjs`'s import-extension rule — see [`CLAUDE.md`](../../../CLAUDE.md#eslint-rules)).
  - `src/monitor/editor-feed.ts:2` — same change, `import { createPatch } from './patch.js';`.
  - Neither call site (`page-feed.ts:34`, `editor-feed.ts:35`) needs to change — same 3-positional-argument call shape.
- Remove `"diff": "^9.0.0"` from `package.json`'s `dependencies` (currently `package.json:75`) and run `npm install` to regenerate `package-lock.json` accordingly — this matches how the repo has removed a dependency before (commit `6631f7b`, "remove stealth plugin do to aging dependencies": `package.json` and `package-lock.json` updated together, no separate lockfile command).
- No other file in the repo imports `diff` (confirmed via search of `src/` and `web/src/`) — no other call sites to migrate.
- No product-spec update needed: `product/specs/monitoring.md` describes the "unified diff" behavior generically (e.g. "size-capped **unified diff**") without naming the `diff` package, so nothing there references the dependency being replaced.
- Keep `src/monitor/patch.ts` under the 200-line `max-lines` ESLint limit (`eslint.config.mjs:60`, skipping blanks/comments). If the line-diff algorithm and the unified-format renderer together would exceed that, split them into two files (e.g. `src/monitor/patch.ts` re-exporting `createPatch`, backed by a sibling module for the raw line-diff algorithm) rather than compacting code to fit — per the file-size guidance in [`ai/guidelines/code-guidelines.md`](../../../ai/guidelines/code-guidelines.md).

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Only two call sites, both same shape | `src/monitor/page-feed.ts:34`, `src/monitor/editor-feed.ts:35` |
| Sibling-module-in-`src/monitor/` pattern to follow | `src/monitor/feeds.ts:4-6` (imports `harnessFeedEntries`/`editorFeedEntries`/`pageFeedEntries` from sibling files) |
| Output byte-cap (already handles truncation, no cap logic needed in the new module) | `cap()` in `src/monitor/page-feed.ts:40`, `src/monitor/editor-feed.ts:67` |
| Existing "pure delete" behavioral test (empty-`newStr` case is already covered, not just a gap to fill) | `src/monitor/editor-feed.test.ts:75-84` (`'emits a diff removing every line when a seen file is deleted'`) |
| Existing "pure add"-shaped test (single-line before/after, `-`/`+` prefix assertions) | `src/monitor/page-feed.test.ts:34-45`, `src/monitor/editor-feed.test.ts:49-58` |
| No existing hand-rolled diff/LCS utility anywhere in the repo | confirmed via search of `src/` and `web/src/` — nothing to reuse, no risk of duplicating logic |
| Repo's prior dependency-removal precedent (`package.json` + `package-lock.json` updated together via `npm install`, no separate lockfile step) | commit `6631f7b` |

## Required API

```ts
function createPatch(fileName: string, oldStr: string, newStr: string): string;
```

- **Inputs**: a display name (not a filesystem path — never read from disk, never validated as a path) and two full text strings to compare, `oldStr` (before) and `newStr` (after).
- **Output**: a single string containing a human-readable unified diff of `oldStr` → `newStr`, suitable for display in a text feed read by a human or an LLM.

## Required behavior (derived from call sites and existing tests)

1. **Line-level diffing.** Both call sites diff multi-line text content (page-view text snapshots, editor file contents). The output must show which lines were removed, added, and (for context) unchanged, at line granularity — not a single opaque blob.

2. **Line prefixing.** Existing tests (`src/monitor/page-feed.test.ts`) assert on `-`/`+` line prefixes directly:
   ```
   expect(entries[0].entry.output).toContain('-original text');
   expect(entries[0].entry.output).toContain('+changed text');
   ```
   Removed lines must appear prefixed with `-`, added lines prefixed with `+`. (Note: these specific test assertions are for single-line before/after content; equivalent coverage for multi-line changes should be added as part of this work — see Testing below.)

3. **Hunk/header formatting is a display concern only — not parsed anywhere.** No code in this repo parses the output back into structured hunks or applies it as a patch. Conventional unified-diff framing (`--- <name>` / `+++ <name>` file headers, `@@ ... @@` hunk headers, one leading space for context lines) is recommended for readability and familiarity to an LLM consuming the text, but exact byte-for-byte conformance to any particular unified-diff spec (timestamps, exact hunk-header line-count semantics, etc.) is **not** a requirement — do not spend implementation effort chasing spec conformance nobody depends on.

4. **Both callers only invoke this when content actually changed.** Callers already guard with `if (previous === current) continue;` before calling `createPatch` — the function does not need to special-case "no diff" (identical inputs), though it should not crash if ever called that way.

5. **Empty-string inputs must work.** Both callers may pass `''` for `oldStr` (content deleted down to nothing) or, per `editor-feed.ts`'s `readContent`, a missing/unreadable file reads as `''`. The function must handle an empty old or new string as a pure add or pure delete, not throw.

6. **No trailing-newline edge-case crashes.** Real editor/page content may or may not end in a trailing newline; the differ must handle both without error or malformed output (e.g. spurious duplicate/missing final line).

7. **Performance bound.** Inputs are user/agent-visible text (editor file contents, page text snapshots) capped for *output* at `MAX_DIFF_BYTES`/`MAX_PAGE_BYTES` (20,000 bytes) after diffing — but the *input* strings themselves are not pre-truncated before `createPatch` is called, so a large file diffed against a large edit is possible. The algorithm must be a standard efficient line-diff (e.g. Myers O(ND) or equivalent) — not a naive O(n³) or worse approach — so a large file (tens of thousands of lines) diffs in well under a second.

8. **Pure function, no I/O.** Must not read files, access globals beyond its inputs, or have side effects — `fileName` is a label only, used purely for display (e.g. in header lines), never opened or stat'd.

9. **No new dependencies.** The implementation must be self-contained TypeScript with no new npm packages — that's the entire point of this change.

## Non-goals

- Word-level or character-level diffing (`diffWords`, `diffChars`, etc. from the `diff` package) — not used anywhere in this repo, do not implement.
- Patch application (`applyPatch`) — not used anywhere in this repo, do not implement.
- Any other export from the `diff` package (`diffLines`, `diffJson`, `structuredPatch`, etc.) — only `createPatch`'s specific call shape used here needs an equivalent.
- Byte-for-byte compatibility with GNU `diff -u` or the `diff` npm package's exact output — only the behavioral contract above matters.

## Testing

- Existing tests must keep passing unchanged: `src/monitor/page-feed.test.ts`, `src/monitor/editor-feed.test.ts`. Two of these already exercise the new module's required behavior indirectly and do not need new assertions: `editor-feed.test.ts:75-84` already covers the pure-delete-to-empty-string case (`rmSync(file)` → diff removes every line), and `page-feed.test.ts:34-45` / `editor-feed.test.ts:49-58` already cover the single-line add/remove `-`/`+` prefix case.
- Add a new colocated test file, `src/monitor/patch.test.ts`, with direct unit tests for `createPatch` covering: pure addition (empty `oldStr`), a multi-line mix of added/removed/unchanged-context lines (not just the single-line case the existing feed tests cover), and a comparison between an input with a trailing newline and one without (confirm no spurious extra/missing line in the output either way).

## Verification

- During development: `./scripts/run.mjs check-diff` — since every changed file is under `src/`, this lints the changed files, incrementally typechecks both projects via `typecheck:diff` (`scripts/check-diff.mjs` runs it unconditionally once any `src/` or `web/` file changes), and runs the affected server tests (`test:diff:server`), which includes `src/monitor/page-feed.test.ts`, `src/monitor/editor-feed.test.ts`, and the new `src/monitor/patch.test.ts`.
- Before calling the work done: `npm run test:server` (or the full `./scripts/run.mjs check-diff` once more) to confirm nothing outside the three touched files regressed, plus `npm ls diff` to confirm the dependency is fully gone from `package-lock.json`.
- Manual end-to-end check: run the app (`npm run dev`), open an editor tab on a small text file and a monitor targeting that tab, edit the file (add a line, remove a line, edit a line in place), and confirm the monitor's flush shows a readable diff with `-`/`+` prefixed lines matching the edit. Repeat once against a page-view tab (edit is simulated by the page's visible text changing) to exercise `page-feed.ts`'s call site too.

## Out of scope for this plan

Implementation itself (the actual diffing algorithm and unified-format renderer) is intentionally left unspecified — that's a separate execution step, done without reading this plan's author's notes on `diff`'s internals (there are none — this plan was written by reading only this repo's call sites and tests, never `node_modules/diff`).
