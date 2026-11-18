# Correct the connections-tab agent terminal-status sentence
**Complexity: 1/10** — documentation only: 0 production lines, 0 production files, 0 behavioral requirements or scenarios (p=1.578); one spec sentence gains `Partial`.

## Goal

Make the connections-tab spec's agent terminal-status sentence list the same outcomes as the record outcome type and the spec's own closed-row and muted-row lists, by adding the missing `Partial`.

## Proposed changes

- Edit `product/specs/connections-tab.md`, in the State paragraph of "The connections tab" section (line 11): change "An agent run record reads `Running` until it finishes, then `Completed`, `Failed`, or `Terminated`." to "An agent run record reads `Running` until it finishes, then `Completed`, `Failed`, `Partial`, or `Terminated`."
- Add `Partial` to that one list only. Leave the surrounding sentence about core ACP records (`Running`, `Idle`, `Closed`) and the sentence about live rows reading `Open` unchanged.
- Make no runtime, test, help, or user-documentation changes. The spec's other agent terminal-status enumerations — the closed-row list, the muted-row list, and the `Partial` tab-control paragraph — already include `Partial` and stay as they are.

## Verification

Read the spec back and confirm every agent terminal-status enumeration in `product/specs/connections-tab.md` lists the same outcomes: `Completed`, `Failed`, `Partial`, `Terminated` (plus `Closed` for ACP records). Confirm the core-ACP-record and live-row sentences are byte-for-byte unchanged. Run `$janissary/scripts/run.mjs check-diff`; the existing connections row and tab tests cover the runtime behavior this sentence documents and must keep passing untouched. Do not run `npm run check`.

## Out of scope

- Any runtime, server, or client change.
- Any change to the spec's other status lists, which already include `Partial`.
- A spec change beyond the single sentence named above.
- Help pages and user documentation; no documented behavior changes.
- The PR description; the entry calls for no description correction.
