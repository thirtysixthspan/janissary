# Group a tool's command and reply in one connection-tab section

**Complexity: 5/10** — ~50 added lines across 3 existing feature files plus a grouping helper, 7 requirements and 12 scenarios (p=5.47).

## Goal

In a connection tab, each activity entry currently becomes its own labelled row. A native tool invocation produces two consecutive `tool` entries — one holding the command as it starts, one holding its result when it finishes — so the reader sees two separate collapsed sections both labelled `tool`. There is no visual link between them, and neither half says which is the command and which is the reply.

Make the connection tab show a tool invocation as a single collapsible section that holds a `command` part and a `reply` part, drawn from the two consecutive `tool` entries. A tool still running shows only its command part until the reply arrives. Every other entry kind and every entry's text stays exactly as it reads today.

## Approach

Keep this entirely in the connections web feature. The record already stores the command and the result as two `tool` activity entries in order; no data-model, schema, or server change is needed. The fix is view-local grouping, like the JSON pretty-print and inline tool-call rendering the tab already does.

Add a pure helper beside the other text-shaping code in `activity-text.ts` that walks a block's entries and emits render rows: non-tool entries pass through untouched, while each tool entry is paired with the immediately following tool entry (if any) into one `tool` row holding a `command` and an optional `reply`. A lone tool entry becomes a `tool` row with only a command — the streaming case before the result lands. Each row carries the original entry index so its React key stays stable across streamed updates, which is what preserves a reader's collapse toggle.

`ConnectionHistory` renders a `tool` row as one `<details>` (still open by default, still toggled by click) whose summary reads `tool` and whose contents are one labelled sub-block per present part. Each sub-block reuses `ActivityText`, so a command or reply that is JSON still pretty-prints and one containing inline `<function_calls>` still renders those calls. Other rows keep their existing labelled rendering.

## Implementation steps

1. **`web/src/plugins/connections/activity-text.ts`** — import the `ConnectionActivity` type, define an `ActivityRow` type (an `activity` row carrying one entry, or a `tool` row carrying a command, optional reply, and the source index), and add a pure `groupToolEntries(entries)` that pairs consecutive `tool` entries and passes all other entries through, preserving each row's source index.
2. **`web/src/plugins/connections/ConnectionHistory.tsx`** — render `groupToolEntries(block.entries)` instead of raw entries; emit one `<details className="connections-activity" open>` per `tool` row keyed by the command's timestamp and source index, with `<summary>tool</summary>` and a labelled `command` / `reply` sub-block per present part; keep the existing branch for every other row.
3. **`web/src/plugins/connections/connections.css`** — add rules for the tool section's labelled command and reply parts next to the existing activity rules, muted like the other activity labels and wrapping long command and result text.

## Tests

- `web/src/plugins/connections/activity-text.test.ts` — `groupToolEntries` passes non-tool entries through unchanged; pairs two consecutive tool entries into one row with command and reply; leaves a lone tool entry with a command and no reply; starts a new pair after a non-tool entry interrupts; keeps the source index of each row.
- `web/src/plugins/connections/ConnectionTab.test.tsx` — two consecutive tool entries render one `details` summary `tool` with a `command` and a `reply` labelled part showing each entry's text; a single tool entry renders only the command part; a JSON command still pretty-prints inside its part and a reply containing inline `<function_calls>` still renders its calls; collapsing the group survives a streamed update to the command or reply; non-tool entries keep their existing labels and rendering.
- `web/src/plugins/connections/connections-style.test.ts` — asserts the new labelled command/reply rules exist and keep long text wrapping.

## Out of scope

- Changing how the server records activity or the order in which the tool loop emits command and result entries. The stored entries are untouched.
- Merging or re-labelling non-tool entries, native `tool_call` ACP updates, or inline `<function_calls>` blocks (each is still rendered by the existing parser).
- Changing the collapse-toggle persistence mechanism or the history paging and follow behaviour.
- New user documentation: only the one existing sentence describing tool activity entries is corrected, plus the matching spec line. No new command, flag, or behavior page is added.
