# Give the summarizer the transcript it is promised, by asking for it

**Complexity: 4/10** — one second activity read with a bounded limit, one recency phrase, and a capability fake that stops lying about what the host hands over.

The launcher's plan promises the summarizer a status snapshot per tab — label, view kind, busy and unread state, how long since its last activity, last command line — "together with a size-capped slice of its recent transcript, so a summary can say both that a tab is busy and what it is busy doing". What it is actually fed is the display read: `ownTabs` calls `capabilities.tabActivity()` with no limit, and `tabActivityRows` emits a tail only when the caller names one. So every real prompt substitutes `No transcript content yet.` for the output slice, and the recap can only ever restate the flags the row already shows. Two smaller debts sit beside it: the recency the plan promises never reaches `describeTab` at all, and the activation's capability fake hands back rows with tails already on them, so the test suite could not have caught either.

## Goal

A summarizer flush reads the tabs with their transcript tails attached, capped at a bounded number of recent entries, while the rows the launcher publishes still carry no transcript content at all. Each tab's description also says how long ago it was last active, measured once per flush.

## Approach

1. **`src/plugins/launcher/activate.ts`** gains a second reader, `summarizedTabs`, which asks `tabActivity(SUMMARIZER_TAIL_ENTRIES)` for the same tabs the display read returns. The display read keeps asking for no tail, because a row draws none and `toRows` in `payload.ts` already strips it — the second read exists precisely so neither path has to compromise. The limit is a named constant: bounded, positive, and read against a capability whose contract is that anything other than a positive number means "no content".
2. The `summarize` intent reads through `summarizedTabs`. Its cursor semantics are unchanged, because the tail is not part of the entry a cursor compares.
3. **`src/plugins/launcher/summarizer.ts`** adds the recency fact to `describeTab`, phrased at the minute resolution the host stamps, and takes the one moment the whole flush is measured against so two tabs cannot be described as of two different clocks. The client's `relativeTime` is the shape; the summarizer needs prose rather than `4m`, so the phrasing lives with the prompt that uses it.

### Rejected alternatives

- Reading the tail once and keeping it on the state's rows. It would put another tab's transcript content into the published payload, which is the one thing `payload.ts` exists to prevent.
- Deriving the tail on the host side whenever any caller asks for activity. A plugin that only lists tabs would then be handed other tabs' output, which `TabActivityEntry`'s own contract rules out.
- Letting `describeTab` read `Date.now()` itself. Each tab would then be measured at a slightly different moment, and the phrase would be untestable.

## Implementation steps

1. Add `SUMMARIZER_TAIL_ENTRIES` and `summarizedTabs` to `src/plugins/launcher/activate.ts`, and point the `summarize` intent at it.
2. Add the recency fact and the per-flush `now` to `describeTab` and `buildSummarizerPrompt`.
3. Update the tests below and run `./scripts/run.mjs check-diff`.

## Tests

- `src/plugins/launcher/activate.test.ts`: the capability fake omits transcript tails unless the caller names a limit, which is the host's own rule rather than a convenience. A flush then proves the transcript text reaches the prompt, and that the payload published in the same flush carries none of it.
- `src/plugins/launcher/activate.test.ts`: the summarizer read asks for a bounded positive number of entries, so an accidental switch back to the unlimited-free read fails rather than silently starving the prompt.
- `src/plugins/launcher/summarizer.test.ts`: `describeTab` reports a tab's recency in minutes, then hours, then "just now", and reports a tab that has never been active as having no activity yet; two tabs in one flush are measured against the same `now`.
- The existing cases keep their meaning, including that a display read still produces rows with no tail.

## Spec updates

- `product/specs/launcher.md`: the summary section states that the summarizer is fed a size-capped slice of each tab's recent transcript along with the flags, and that what is published carries none of it.

## Out of scope

- Which tabs are eligible for summarization — the launcher's own-tab exclusion by label, and the docked tabs that still reach a flush. Both are recorded as their own entries.
- Re-reading the tabs after an awaited prompt, and the cursor's blindness to an edited transcript. Also their own entries.
