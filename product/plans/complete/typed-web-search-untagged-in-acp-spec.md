# Add typed web search to the ACP spec's untagged typed-output list

**Complexity: 1/10** — no production lines or files, two requirements, no test scenarios or new units (p=2.35).

## Goal

The tag paragraph of `product/specs/acp.md` enumerates the typed outputs that carry no `[<host>] ` tag as `file read`, `file glob`, `file grep`, `file write`, and `file edit`. It omits typed `web search`, although a typed search on a remote tab returns through its own remote port session exactly like a typed read, and the user documentation already lists `web search` among the untagged typed outputs. The spec and the user documentation disagree on an observable transcript detail.

After the fix, the paragraph lists `web search` between `file grep` and `file write`, matching the order in `documentation/user-documentation/advanced-agents/acp-agent.md`. No behavior changes: the spec already describes the loop's workspace steps as the only tagged text, and a typed search is not a workspace step. The Web search section and every other sentence stay as they are.

## Approach

1. **`product/specs/acp.md`, tag paragraph.** In the sentence "Caller-side steps, gate refusals, and the output of typed `file read`, `file glob`, `file grep`, `file write`, and `file edit` are untagged.", change the enumeration to `file read`, `file glob`, `file grep`, `web search`, `file write`, and `file edit`. Change nothing else in that sentence or paragraph.

2. **Leave the Web search section unchanged.** It already says a granted step is a workspace step and follows the workspace routing; it does not claim a typed search is tagged. Adding the tag rule there would duplicate the routing paragraph.

3. **Leave the user documentation unchanged.** `documentation/user-documentation/advanced-agents/acp-agent.md` already says a typed `file read`, `file glob`, `file grep`, `web search`, `file write`, or `file edit` carries no tag. The spec is the file that lags.

## Evidence the new sentence matches the code

| Claim | Where it is pinned |
| --- | --- |
| `tagged` prefixes exactly when the tab is remote and the step reports `workspace: true` | `src/acp/run-prompt.ts:110` |
| The workspace flag comes from the tool table's `runsOn`, not from the tab being remote | `src/acp/drive-loop.ts:55` |
| A typed `web search` runs through `searchWebInTab`, which returns a remote tab's result through `withRemoteTabPort` and adds no tag | `src/web-search/tab-search.ts:12`, `src/web-search/tab-search.ts:25` |

The loop calls `searchWebInTab` for a granted `web` line, so the same function serves both the typed command and the workspace step; only the latter passes `workspace: true` to `tagged`. The typed command's output therefore carries no tag, which is what the corrected sentence records.

## Design decisions

1. **One list, one order.** The user documentation enumerates `file read`, `file glob`, `file grep`, `web search`, `file write`, `file edit`. Copying that order into the spec keeps the two documents diffable against each other and puts the new item where a reader of either document expects it.

2. **Name the typed form.** The phrase is `typed web search` by implication of the sentence's "the output of typed …" prefix, the same way the other five commands are named without their typed qualifier repeated. Adding an explanatory clause would restate the routing paragraph.

3. **No code change.** `tagged` and `searchWebInTab` already do what the corrected sentence says; the defect is in the record, not the behavior. The remote-hosted loop's web step stays tagged because it reports `workspace: true`, and the spec says so both in the routing paragraph and in the Web search section.

## Implementation steps

1. Edit the tag paragraph in `product/specs/acp.md` to insert `web search` after `file grep` in the untagged typed-output list.
2. Run `$janissary/scripts/run.mjs check-diff` and confirm it reports no changes to ship beyond the spec and this plan's move.
3. Re-read the paragraph and the Web search section to confirm every other sentence is byte-for-byte unchanged.

## Tests

None. No code changes; there is nothing to execute. The behavior the sentence records is already covered by the existing `run-prompt` tests that assert a remote workspace step is tagged and a caller-side step is not.

## Out of scope

- The routing paragraph's `tagged` rule and the Web search section's text.
- `src/acp/run-prompt.ts`, `src/acp/drive-loop.ts`, and `src/web-search/tab-search.ts`.
- `documentation/user-documentation/advanced-agents/acp-agent.md`, which already lists `web search`.
- `help/web.md`, which does not describe transcript tags.
- The remaining pull-request backlog.

## Verification

`./scripts/run.mjs check-diff`, then read the tag paragraph and confirm the six-item list in the documented order and that the surrounding sentences are unchanged.
