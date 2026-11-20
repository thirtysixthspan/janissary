# Correct the tool-table resolution comment

**Complexity: 1/10** — 3 comment lines rewritten in 1 production file, 1 contract to document, no behavior changes, new tests, or units (p=2.66)

The resolution comment above `createAcpToolTable` still says extraction takes "the reply's last line that any tool recognizes", but the labelled-fenced-block migration changed extraction to read the command inside the last closed labelled block. Rewrite only that extraction sentence so the comment matches the real contract. This is a comment-only, behavior-neutral edit.

## Goal

Make the comment above `createAcpToolTable` in `src/acp/tool-table.ts` accurately describe how `toolExtractor` now picks a command: it reads the command inside the last closed labelled (```janissary) block, and this choice does not depend on tool-table order. Leave the first-match running rule and every other sentence of the comment exactly as written.

## Approach

1. Keep the first three sentences of the comment untouched — the first-match-over-an-ordered-array rule for running, its tie-break role, and the database fall-through.
2. Replace only the two-sentence extraction sentence ("Extraction does not use table order: the reply's last line that any tool recognizes is the command, whichever tool owns it.") with wording that states the extractor reads the command inside the last closed labelled block in the reply, while retaining the statement that extraction does not use table order and the "whichever tool owns it" tail.
3. Change no code, no test, no spec, and no documentation. The existing extraction and gating tests in `src/acp/tool-table.test.ts` and `src/acp/command-block.test.ts` already pin the labelled-block contract and must keep passing untouched.

## What already exists (reuse, don't rebuild)

| Existing piece | File | Relevance |
| --- | --- | --- |
| Resolution comment above `createAcpToolTable` | `src/acp/tool-table.ts:42` | The only text to edit; its first-match sentence stays. |
| `toolExtractor` | `src/acp/tool-table.ts:195` | Delegates to the shared extractor; already reads a labelled block. |
| `extractCommandBlock` | `src/acp/command-block.ts:98` | Scans for the last closed labelled fence; source of the contract being documented. |
| Extraction and gating tests | `src/acp/tool-table.test.ts`, `src/acp/command-block.test.ts` | Already assert the real behavior; no changes needed. |

## Implementation steps

1. In `src/acp/tool-table.ts`, rewrite the extraction sentence of the comment above `createAcpToolTable` to state that the extractor reads the command inside the last closed labelled block in the reply and that extraction remains independent of table order. Leave the first-match running rule and the rest of the comment byte-for-byte unchanged.
2. Change nothing else.

## Tests

No new tests: this is a comment-only edit. The existing extraction and gating tests in `src/acp/tool-table.test.ts` (for example, `picks the last command line even when an earlier line belongs to a tool listed first`) and `src/acp/command-block.test.ts` already cover labelled-block extraction and table-order independence, and must keep passing untouched.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after the change; the full server suite must stay green. Confirm the diff touches only comment lines in `src/acp/tool-table.ts` and that the first-match running sentence and the rest of the comment are unchanged.

## Out of scope

- No functional change, no code, test, or fixture edits.
- No spec, help, or user-documentation edits — no user-visible behavior changed.
- No PR description change and no other backlog entry.
