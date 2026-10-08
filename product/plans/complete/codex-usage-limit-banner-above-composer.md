# Recognize a Codex usage-limit banner above its composer

**Complexity: 2/10** — the reported banner's wording and reset clause are already read correctly; what misses it is the trailing-row window, which does not reach past codex's composer. One constant, its comments, and the tests that pin the window.

## Goal

A codex tab parked on a reported usage-limit banner schedules its own auto-resume, on the screen codex actually paints:

```
■ You've hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro),
visit https://chatgpt.com/settings/usage to purchase more credits or try again
at 12:33 PM.
```

with its composer beneath it.

## The banner is already read; the window is what misses it

`detectResumeLimit` (`src/harness/auto-resume.ts`) matches `LIMIT_PATTERN` against the trailing non-blank rows of the capture — `LIMIT_WINDOW_ROWS`, three, for codex. The reported banner is 172 characters and the harness PTY is eighty columns wide by default (`src/pty.ts`), so codex wraps it across **three** rows. Its composer sits below that: the input box's border, input and border rows, then the `⏎ send` hint row that `isLiveComposerLine` in `src/harness/codex-permission-gate.ts` already identifies as codex's live composer. Seven rows sit between the banner's first row and the bottom of the screen, so the trailing three never contain `hit your usage limit` and the limit goes unrecognized — no resume scheduled, and a pending one cancelled.

The existing fixture that pins this banner reads it only as one unwrapped row, which is why it passes and the report stands: the pattern, the `[^]{0,200}?` gap (121 characters here) and `parseResetClause` all handle the text. Only the window is wrong.

## Approach

Widen the window to eight rows and give the field that carried opencode's count a single home. Both recognized harnesses now need the same width — codex's banner plus its composer, opencode's footer banner plus the input, hint and model rows — so `LIMIT_WINDOW_ROWS` becomes that width and the per-entry `rows` override is removed rather than left with no user. A harness needing a different width gets it by changing the one constant.

Eight keeps the staleness guard meaningful: with a three-row banner and four rows of composer, a banner quoted further up codex's scrollback falls outside, while one the harness is still sitting on does not.

## Implementation steps

1. In `src/harness/auto-resume.ts`:
   - set `LIMIT_WINDOW_ROWS` to eight, with a comment naming why both harnesses need the composer's rows beneath the banner;
   - drop the `rows` field from `ResumeEntry`, its comment, the `entry.rows ?? LIMIT_WINDOW_ROWS` slice, and opencode's `rows: 8`.
2. Tests in `src/harness/auto-resume.test.ts` for the reported banner as codex paints it, and for the window's edge in both directions.
3. `product/specs/harness.md` § Auto-resume after a usage limit: the trailing-row count and the staleness paragraph.

## Tests

- the reported banner wrapped across three rows at eighty columns, with codex's composer beneath it, reading `{ kind: 'at', time: { hour: 12, minute: 33 } }`;
- the same banner still read with no composer beneath it, and with one row of output printed since;
- a banner pushed far enough up codex's scrollback to fall outside the window — no match;
- opencode's editor-chrome case unchanged, and its `rows`-free table row still reads its duration;
- `HarnessAutoResumer` scheduling a resume for the reported screen;
- `./scripts/run.mjs check-diff`.

## Out of scope

- The `[^]{0,200}?` gap and `LIMIT_PATTERN` itself, which already read the reported banner's links and reset.
- The 24-hour duration ceiling, which governs opencode's weekly and monthly windows.
- A per-harness row count. Reintroducing it is a one-line change if a third harness ever needs a different width; nothing in the registry wants one today.