# Compress harness screen captures before sending them to monitor ACP agents

**Complexity: 3/10** — one new pure text-transform helper, wired into an existing feed function that already isolates the concern (`harnessFeedEntries`), plus tests and a one-paragraph spec update; no protocol, storage, or timing changes.

## Summary

A harness-view monitor target contributes its latest rendered terminal screen to the monitor's flush batch (`src/monitor/harness-feed.ts`'s `harnessFeedEntries`), sourced from `HarnessScreenReader.captureNow()` (`src/harness/screen.ts`), which already resolves ANSI/cursor escapes into plain rendered text via xterm's `translateToString(true)`. That resolved text still carries TUI chrome that is visual, not informational, for a model reading it as data: box-drawing border characters (`U+2500`–`U+257F`) and Braille spinner glyphs (`U+2800`–`U+28FF`), plus the blank and duplicate lines those borders/redraws leave behind once stripped. Per the backlog ("compress the harness screen captures before being sent to acp agents in order to remove non-text and repeated content"), the text fed to monitors — not the text `harness capture`/`harness transcript` writes for a human to view — is compressed to drop this chrome and collapse the repetition it produces.

This only changes the copy sent to a monitor's ACP session. `harness capture <label>` and the shared `HarnessManager.latestScreenText` continue to return the screen exactly as captured; the compression is applied where the monitor feed turns that capture into a batch entry, not upstream in the shared capture path.

## Design decisions

- **Compress only the monitor feed, not the shared capture.** `HarnessScreenReader`/`latestScreenText` are used by both `harness capture` (a human-facing debug/inspection command) and the monitor feed; a human reading a capture wants the literal screen, borders and all, so compression is applied in `harnessFeedEntries` right before the text becomes a `LogEntry.output`, not in `screen.ts`'s `captureNow()`.
- **"Non-text" = box-drawing and spinner glyphs.** These two Unicode ranges cover the terminal chrome the three supported harnesses (claude/codex/opencode) render for panels, borders, and progress spinners (the same Braille range `busy-classify.ts` already keys off of for spinner detection) — stripping them, not the model's actual reply/tool-output text.
- **"Repeated content" = collapsing blank/duplicate lines produced by that stripping.** Removing border characters from a row that was otherwise only border (e.g. a box's top/bottom edge) leaves an empty line; several such rows in sequence collapse to a single blank line. A content line repeated verbatim on the next line (e.g. a redrawn status line) collapses to one occurrence. Collapsing is line-by-line and only ever merges *adjacent* duplicates/blanks — it does not deduplicate identical lines that are far apart, since those may be legitimately repeated content (e.g. the same shell prompt appearing twice after two separate commands).
- **No byte-size cap added here.** `src/monitor/feed-diff.ts`'s `cap()` truncation is a separate, unrelated concern (editor/page/transcript feeds) that today is not applied to harness screens either; adding it is out of scope for this fix, which is about content quality, not size limits.

## What already exists (reuse, don't rebuild)

| Need | Existing thing | Location |
| --- | --- | --- |
| Where the harness screen becomes a monitor feed entry | `harnessFeedEntries` | `src/monitor/harness-feed.ts:12-26` |
| The already-resolved (de-ANSI'd) screen text this operates on | `HarnessScreenReader.captureNow()` / `ScreenCapture.text` | `src/harness/screen.ts:66-75` |
| Precedent for the Braille spinner Unicode range | `leadsWithBraille` | `src/harness/busy-classify.ts:8` |
| Style precedent for a small pure text-transform helper colocated with its feed | `cap()` in `feed-diff.ts` | `src/monitor/feed-diff.ts:6-11` |

## Implementation steps

1. In `src/monitor/harness-feed.ts`, add an exported pure helper `compressScreenText(text: string): string`:
   - Split on `\n`.
   - For each line, strip characters in `─`–`╿` (box-drawing) and `⠀`–`⣿` (Braille spinner glyphs), then trim trailing whitespace (matching the trim convention `translateToString(true)` already applies per-line).
   - Walk the resulting lines, skipping a line when it is blank and the previous kept line was also blank, and skipping a line when it is identical to the immediately preceding kept line (non-blank case) — i.e. collapse adjacent blank runs to one blank line and adjacent exact-duplicate runs to one occurrence.
   - Join with `\n` and return.
2. In `harnessFeedEntries`, apply `compressScreenText(latest.text)` when building `entry.output` (the dedup-by-`capturedAt` check against `harnessSeen` stays keyed on the raw `latest.capturedAt`, unaffected by compression).
3. Update `./product/specs/monitoring.md`'s harness-view target paragraph to note that the fed screen is compressed (chrome stripped, adjacent repetition collapsed) and so is no longer byte-identical to what `harness capture` writes, even though both start from the same underlying capture.

## Tests

- `src/monitor/harness-feed.test.ts` (new `describe('compressScreenText', ...)` block, exported alongside `harnessFeedEntries`):
  - strips box-drawing characters from a bordered line, leaving the enclosed text.
  - strips Braille spinner glyphs.
  - collapses three consecutive blank lines (post-stripping) into one.
  - collapses a line repeated on the next line into a single occurrence.
  - leaves non-adjacent duplicate lines (separated by other content) untouched.
  - leaves ordinary multi-line text with no chrome unchanged.
- `src/monitor/harness-feed.test.ts` (extend `describe('harnessFeedEntries', ...)`): a capture whose `text` contains box-drawing border lines around real content emits an entry whose `output` has the border stripped and the content preserved — confirming the helper is actually wired into the feed, not just unit-tested in isolation.

## Out of scope

- Any change to `HarnessScreenReader`, `captureNow()`, or `harness capture`/`harness transcript` output — those remain byte-for-byte as captured.
- Adding a size cap (`cap()`) to the harness screen feed.
- Compressing the harness *session transcript* feed (`harness-transcript-feed.ts`), which is a different, already-normalized text source untouched by this change.
- Non-adjacent (whole-buffer) deduplication of repeated lines.
