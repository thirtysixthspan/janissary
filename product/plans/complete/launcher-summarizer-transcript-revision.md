# See a transcript that changed without growing

**Complexity: 6/10** — one new field on the tab runtime written by the three transcript writers, one field through the activity contract, and a cursor that stops watching only a length.

`summarizeOnce` in `src/plugins/launcher/summarizer.ts` keeps a per-label cursor of `logLength` and prompts a tab when its current length differs from the recorded one. That comparison is blind to two writes that leave the length exactly where it was:

1. **Output rewritten into a running entry.** `updateRunningEntry` in `src/tab/transcript/events.ts` rewrites the running entry in place, so a streaming command and then its completed output never move `logLength` at all.
2. **An append to a log already at its cap.** `capLog` drops the oldest entry, so the length sits at its ceiling forever and the newest entry is invisible to the cursor.

Both leave a tab holding its first paragraph indefinitely — the row says what the tab was doing when it was first summarised, which is precisely the case the launcher exists to answer. A third, smaller case rides along: a label recycled onto a new tab is caught by inequality, and has to keep being.

## Goal

A tab whose transcript was really written to is prompted, whether or not its log's length moved, and a tab nothing happened to still prompts nothing.

## Approach

1. **`src/tab/types.ts`** gains `transcriptRevision` on `TabRuntime`: a monotonic counter, in-memory only, beside `lastActivity` for the same reason — the log itself holds no record of having been written.
2. **`src/tab/transcript/events.ts`** advances it beside each real write: `appendTab` (which covers a capped replacement as well as a plain append), `updateRunningEntry` when it actually rewrote a running entry, and `clearTranscriptTab`. It is not advanced by a write that changed nothing — an update whose match found no running entry — so a flush is not woken by a no-op.
3. **`src/plugins/activity.ts`** carries it on `TabActivityEntry` as `revision`, read the same way `logLength` is. It flows to plugins through the `api.ts` re-export of that type, so the pull contract is the only place it is defined.
4. **`src/plugins/launcher/summarizer.ts`** changes the cursor from a length to a `{ length, revision }` pair per label and prompts on inequality in either half. The length stays in the cursor rather than being replaced, because the reader is not the only writer: a tab whose log is appended outside `events.ts` — a remote tab's channel output — still moves the length, and dropping it would narrow what the cursor sees.
5. **`src/plugins/launcher/payload.ts`** deliberately does not project `revision`, exactly as it does not project the tail. The rows are fingerprinted as `LauncherTabRow`, so a streaming tab's rising revision cannot force a payload republish; a test pins that.

### Rejected alternatives

- Fingerprinting the tail's text and comparing that. It would mean the summarizer holds a copy of every tab's recent output to decide whether to ask for it, and a rewrite that keeps the same characters would still be invisible.
- Watching the raw `state: dirty` broadcast to decide whether to re-ask. That is a prompt per transcript append, which is the cost the cursor exists to avoid, and the flush is an intent the client raises on its own cadence.
- Replacing the length in the cursor with the revision alone. See step 4: the length is the only signal for writes that happen outside `events.ts`.

## Implementation steps

1. Add `transcriptRevision` to `TabRuntime`.
2. Advance it in the three writers in `src/tab/transcript/events.ts`.
3. Carry `revision` through `TabActivityEntry` and its reader.
4. Widen the summarizer's cursor and its comparison.
5. Update the tests below and run `./scripts/run.mjs check-diff`.

## Tests

- `src/tab/transcript/events.test.ts`: an append advances the revision; a capped append advances it too; an in-place update of a running entry advances it; a finished entry advances it; clearing the log advances it; and an update whose match found no running entry does not, because nothing was written.
- `src/plugins/activity.test.ts`: the reader reports a tab's revision from its runtime, and zero for a tab that has never had one written.
- `src/plugins/launcher/summarizer.test.ts`: a flush prompts a tab whose output was rewritten in place at an unchanged length; a flush prompts a tab whose log is at its cap and receives another entry; a flush asks nothing at all when neither the length nor the revision moved; and a tab that reuses a recycled label is still prompted.
- `src/plugins/launcher/activate.test.ts` (or `payload`): two activity rows that differ only by revision produce identical payload rows, so a streaming tab cannot force a republish.

## Spec updates

- `product/specs/launcher.md`: the summary section says a flush asks about a tab whose transcript changed, whether or not its length moved, and that nothing is prompted when nothing did.

## Out of scope

- The other writers that touch `tab.log` outside `events.ts`. They are not summarised tab content, and where they are — a remote tab — the length half of the cursor already covers them.
- Re-reading the tabs after an awaited prompt, and merging a partial reply into the summaries. Their own entries.
