# Support auto-resume in opencode

**Complexity: 3/10** — one registry row, one pattern, and one new per-row field carrying a trailing-row count. Every piece of plumbing (the observer, the schedule entry, the flag, the busy-tracking parked rule, the remote split, the launch option) already exists and is keyed off `supportsHarnessAutoResume`, so nothing new is designed; the work is naming opencode's limit text accurately and correcting the wording that says opencode has none.

## Goal

`RESUME_TABLE` in `src/harness/auto-resume.ts` recognizes exactly one harness today: codex. opencode was excluded on the belief that it hangs mid-generation and prints nothing when a subscription limit hits (`product/plans/complete/auto-resume.md` § Out of scope; `product/specs/harness.md` § Auto-resume). opencode 1.18.32 does print a limit banner, and it names the moment it will accept work again:

```
Usage limit reached. It will reset in 1 hour 59 minutes. To continue using this model now, enable usage from your available balance - https://opencode.ai/workspace/wrk_01K6XGM22R6FM8JVABE9XDQXGH/go
```

Adding an `opencode` row makes a tab parked on that banner schedule its own resume, exactly as a codex tab does — and makes `--auto-resume`, the launch-dialog checkbox and the strip flag apply to opencode as well.

## The screen text, verified against the harness

opencode builds the banner in its session retry logic (`SessionRetry.retryable`, read out of the installed 1.18.32 binary):

- the wording is `` `${limitName} usage limit` `` when the response carries a `limitName`, and `Usage limit` when it does not, followed by ` reached. It will reset in ${duration}.`;
- `limitName` is one of `5 hour`, `weekly`, `monthly`, so the rendered forms are `5 hour usage limit reached.`, `weekly usage limit reached.`, `monthly usage limit reached.` and `Usage limit reached.`;
- the duration is built from the `retry-after` header and is always *relative*: `10 days 19 hours`, `2 days 3 hours`, `5 hours 23 minutes`, `1 hour 59 minutes`, `15 minutes`, or `less than a minute`.

Three consequences shape the design:

1. **Anchor on `usage limit reached`.** Every form contains it, so one case-insensitive anchor covers all four spellings — the same superset the codex pattern gets by not naming its own apostrophe.
2. **The reset is always a duration.** opencode never states a clock time or a calendar date, so the existing `relativeReset` arm — the scheduler's own `parseInterval`, summing `N<unit>` tokens, refusing anything past `MAX_RELATIVE_MS` — is the whole parser. Nothing is re-implemented.
3. **`it will reset in` is a literal `in`.** Capturing that word as the pattern's first group keeps both patterns on the identical `(keyword) (clause)` shape `parseResetClause` already expects, so the clause-reading function is untouched.

### The trailing-row window

The reader matches against the last `LIMIT_WINDOW_ROWS` non-blank rows of the screen, which is what keeps a limit banner quoted in scrollback from scheduling anything. codex's banner ends the screen and three rows is what its two-row wrap needs.

opencode paints the banner in its editor footer, appending ` [retrying in ~2 hours attempt #1]`, and truncates the message to 80 characters with an ellipsis before appending that. Two facts make opencode safe here:

- **The banner always survives the truncation.** The longest form, `monthly usage limit reached. It will reset in 10 days 19 hours.`, is 66 characters, so both halves the pattern needs are inside the 80 the harness shows.
- **opencode's footer block is not scrollback.** It is drawn in the editor region beside `esc to interrupt`, replacing the composer while the session is retrying, and it is removed the moment the retry state ends — the same reason `detectOpencodePermissionGate` needs no staleness check where codex's and claude's menus do (`src/harness/opencode-permission-gate.ts`).

The editor chrome below the banner (the input row, the hint row, the model row) means the banner's first row is not reliably among the last three. So the trailing-row count moves into the registry row as an optional `rows`, with `LIMIT_WINDOW_ROWS` staying the default that codex takes. opencode declares `8`, which covers the banner's first row with up to seven rows of editor chrome beneath it.

Widening the window is safe *because* the message is not in the message stream: the widest window opencode could need still reads only the live footer block, never a conversation turn.

### What is deliberately still not scheduled

- **`less than a minute`** names no digits, so `relativeReset` finds no tokens and returns nothing. The banner is recognized; nothing is scheduled — the same outcome codex's untrusted forms have.
- **A weekly or monthly limit** states `2 days 3 hours` or `10 days 19 hours`, both past the shared 24-hour `MAX_RELATIVE_MS` ceiling. Recognized, not scheduled, badged as it is today. The ceiling was chosen for codex against claude's own 24-hour handover, and changing it is a separate policy decision; see *Out of scope*.

## Approach

1. `src/harness/auto-resume.ts`:
   - `ResumeEntry` gains an optional `rows`, documented as the trailing-row count for a harness whose limit banner does not end the screen.
   - `detectResumeLimit` slices by `entry.rows ?? LIMIT_WINDOW_ROWS`.
   - a new `OPENCODE_LIMIT_PATTERN` — `usage limit reached … it will reset (in) (<clause>)`, bounded between the two halves — and an `opencode` row carrying it with `rows: 8`.
   - the `RESUME_TABLE` comment loses the "opencode hangs mid-generation and prints no limit" claim, which this change falsifies.
2. Test fixtures and expectations that assert the registry's *contents* follow from the registry: `src/harness/command-parse.test.ts`'s refusal text, `src/harness/manager.test.ts`'s `harnessLaunchView().autoResume`, `src/harness/auto-resume.test.ts`'s name list, and `web/src/harness/HarnessLaunchDialog.test.tsx`'s delivered `autoResume` list and the label it renders from it.

## Tests

- `src/harness/auto-resume.test.ts`:
  - opencode's four banner spellings (`Usage limit reached.` with no `limitName`, and `5 hour` / `weekly` / `monthly`), each reading its stated duration;
  - `1 hour 59 minutes`, `5 hours 23 minutes`, `15 minutes` and a lone `1 hour`, summing into the right instant;
  - the truncated form the harness actually paints — 80 characters plus `…` — still matching;
  - the banner as it wraps across two screen rows, and the banner with editor chrome below it (the rows the widened window exists for);
  - `less than a minute` → no match; `2 days 3 hours` and `10 days 19 hours` → no match, past the 24-hour ceiling;
  - a banner the harness has since printed beneath → no match (staleness);
  - codex's `opencode` refusal path — `detectResumeLimit(BANNER, 'opencode')` → no match, and codex's own banner still matches only codex;
  - `autoResumeHarnessNames()` is `['opencode', 'codex']` in catalog order and `describeAutoResumeHarnesses()` reads `opencode and codex`.
- `src/harness/command-parse.test.ts`: `--auto-resume` is still refused for claude, now naming both harnesses.
- `src/harness/manager.test.ts`: `harnessLaunchView().autoResume` is `['opencode', 'codex']`.
- `web/src/harness/HarnessLaunchDialog.test.tsx`: the delivered list covering two harnesses renders `— opencode and codex only`, and switching to a harness outside it still clears and disables the checkbox.

## Spec updates

- `product/specs/harness.md` § Auto-resume after a usage limit — opencode joins codex in the recognized set; the refusal names both; the "claude and opencode are absent" paragraph becomes the claude-only reason plus opencode's own banner wording and truncation; the trailing-row window is per harness rather than a flat three; the duration ceiling paragraph gains opencode's weekly and monthly forms.

## Docs

- `help.md` — the `harness` row's "codex also schedules its own resume after a usage limit" becomes codex and opencode.
- `documentation/user-documentation/advanced-agents/harness.md` — the launch-dialog paragraph's Auto-resume default and availability, the "no other harness accepts the flag" sentence, and the auto-resume section's opening.

## Out of scope

- **The 24-hour duration ceiling.** opencode's weekly and monthly limits state durations past it, so those two forms are recognized and deliberately not scheduled. Raising the ceiling is a one-constant change in `relativeReset`, but it is a policy decision about how long the app should park a tab on the user's behalf, and the existing ceiling was chosen deliberately for codex (`product/plans/complete/auto-resume.md` § Deliberate ceilings). Flagged for the human rather than changed here.
- **opencode's own retry.** opencode already retries the limit itself on an exponential backoff (`[retrying in ~2 hours attempt #1]`), so this feature is a backstop, not the only path. One resume per blockage is unchanged, so the two never pile up: whichever clears the limit first changes the screen, which clears the other's entry.
- **A tab whose limit names no usable reset.** `less than a minute`, and any reworded banner, stay badged and unscheduled.
- **A stalled-harness detector** for the pre-1.18.32 behaviour where opencode hung without printing, which the pre-existing out-of-scope note also covers.