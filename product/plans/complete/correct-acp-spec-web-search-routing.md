# Correct the ACP spec's web-search routing sentence

**Complexity: 1/10** — no production code, one spec sentence replaced, one requirement, no test scenarios (p=2.07).

## Goal

The tool-dispatch paragraph of `product/specs/acp.md` says a `web` line "goes to the same search as the typed command on the host running the loop". That host is the wrong side for a local-fallback ACP session on a remote tab: the search follows the tab, not the loop. The paragraph's own next clause and the spec's Web search section say the search runs on the side that owns the tab, so the sentence contradicts both its neighborhood and the implementation. The reader should be told the routing that is actually implemented.

## Approach

Replace the six words "on the host running the loop" with "on the side that owns the tab" in the one sentence, leaving the rest of the sentence and paragraph exactly as written. The replacement is the phrase the plan's design decision and the spec's Web search section already use, so the three statements agree word for word.

The sentence's colon still explains the two sides correctly: "locally through the tab, so a local fallback session on a remote tab searches on the remote machine, and on the far side with that workspace's merged tokens and no notification." Nothing after the colon needs to change.

## Design decisions

1. **Correct the routing phrase, not the surrounding prose.** The paragraph's other claims — caller-side dispatch, the file commands' local and far-side entries, cancellation behavior, transcripts — are accurate and out of scope. A minimal replacement keeps the diff to one phrase and leaves no room for an unrelated rewrite.

2. **Use the spec's existing wording.** The Web search section ends "searches on the side that owns the tab", and the plan's design decision says "A granted search runs on the side that owns the tab, not on the host running the ACP loop." Using the same phrase here makes the two spec sections read as one rule rather than two approximations of it.

3. **Leave the file-read and file-glob "host running the loop" shorthand alone.** Those sentences describe a workspace path rooted on the host that runs the loop, which is the correct side for a workspace command. The entry names that shorthand as outside its scope, and it is not the claim being corrected.

4. **No code, test, help, or user-documentation change.** The behavior already matches the corrected sentence, so nothing in `src/` or its tests changes. `documentation/user-documentation/advanced-agents/acp-agent.md` already says a granted search "runs on the side that owns the tab", and `product/specs/web-search.md` says the same, so neither needs an edit.

## What already exists (reuse, don't rebuild)

| Need | Existing precedent | Location |
| --- | --- | --- |
| The routing rule the sentence should state | "A granted search runs on the side that owns the tab, not on the host running the ACP loop" | `product/plans/complete/web-search.md`, design decisions |
| The same rule in the spec's Web search section | "reaches the same search as the typed command and searches on the side that owns the tab" | `product/specs/acp.md` |
| The typed command's routing rule | "The typed command searches on the side that owns the tab" | `product/specs/web-search.md` |
| The implementation that decides the side | `searchWebInTab` reads `localReadRoot`; a remote tab goes through `withRemoteTabPort` | `src/web-search/tab-search.ts` |
| The loop's handoff of the tab label | `runWorkspace` calls `searchWebInTab(managers, label, …)` | `src/acp/run-prompt.ts` |

## Proposed changes

1. **`product/specs/acp.md`**, tool-dispatch paragraph: in "A `web` line likewise goes to the same search as the typed command on the host running the loop", replace "on the host running the loop" with "on the side that owns the tab". Nothing else in the paragraph changes.
2. **`product/backlog/pull-request.md`**: remove the resolved entry, leaving the other entries byte-for-byte.
3. **Plan storage**: this plan moves from `draft/` to `ready/` after rating, then to `complete/` after the edit.

## Implementation steps

1. Edit the one sentence in `product/specs/acp.md`.
2. Read the repaired paragraph against `product/specs/web-search.md`, the Web search section of `product/specs/acp.md`, `product/plans/complete/web-search.md`, and `documentation/user-documentation/advanced-agents/acp-agent.md`; confirm all five state the same side.
3. Confirm the implementation matches: `src/acp/run-prompt.ts` passes the tab label to `searchWebInTab`, and `src/web-search/tab-search.ts` sends a tab with no local root, such as a remote tab, through `withRemoteTabPort` to `webSearch` on the remote host.
4. Run `$janissary/scripts/run.mjs check-diff`. The change is markdown only, so it is expected to have nothing to lint, typecheck, or test, and must exit 0.
5. Remove the resolved entry from `product/backlog/pull-request.md`.

## Tests

No automated tests. The change is a prose correction in a functional spec, and the behavior it describes is already implemented and covered by existing tests in `src/web-search/`; there is no test surface for a spec sentence. Run `$janissary/scripts/run.mjs check-diff` after the edit and confirm it exits 0.

Manual verification: read the corrected sentence against the Web search section of `product/specs/acp.md`, `product/specs/web-search.md`, the design decision in `product/plans/complete/web-search.md`, the routing paragraph in `documentation/user-documentation/advanced-agents/acp-agent.md`, and the two source files named above.

## Out of scope

- Changing `src/acp/`, `src/web-search/`, or any test.
- Changing the "host running the loop" shorthand in the file-read, file-glob, or file-grep paragraphs; those statements are about a workspace root and are correct.
- Changing `help/`, `product/specs/web-search.md`, or `documentation/`; all already describe the routing correctly.
- Changing the pull request title or description; the entry asks for neither.
