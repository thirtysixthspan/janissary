# Add a blank line between an ACP command's thought link and its answer

**Complexity: 2/10** — ~3 added lines in 1 production file, 2 requirements and 3 test scenarios, no new modules or wire types (p=3.46).

## Summary

Per the backlog: "add a new line between the command and the response for any acp command that prints out see thought process on the line after the command."

An accepted `ask`, `tell`, or `subagent` prompt (and a pending core prompt with a caller-supplied echo) leaves a `Thinking` decoration on the row below its echoed command. When the answer settles, that decoration becomes a `see thought process` link and the answer is written as a Markdown block. Today the answer block starts on the very next row after the link, so the link and the answer are crowded together with no visual separation.

This change reserves one additional blank terminal row before the answer whenever a thinking marker is present. The marker keeps its own line immediately below the command, the answer starts one row lower than before, and a single empty row sits between the `see thought process` link and the answer. Replies that do not settle a thinking marker keep their existing placement, so ordinary command output is untouched.

## Design decisions

- **Reserve the row in the block writer, not the marker.** `insertMarkdownBlock` already owns the rows the answer reserves and positions its decoration from a marker on the last of those rows. Prefixing its write with one more `\r\n` moves the reserved rows and the decoration down by one while the position math stays correct. Changing the marker's own placement would desynchronise it from the answer's reserved rows.
- **Only when a marker is present.** `insertMarkdownBlock` already takes a `reserveRow` flag that `writeShellReply` passes only for replies that settle a thinking marker into a link. Extending that existing clearance keeps the blank line scoped to the ACP commands named in the backlog; replies without a marker still get no clearance.
- **Both placement paths.** Whether the answer continues beneath its own echo or is written under a repeated command line, a settled reply carries `onHeadMarker`, so both paths get the extra row through the same flag.

## What already exists (reuse, don't rebuild)

| Need | Existing thing to reuse | Location |
| --- | --- | --- |
| Reserves terminal rows and positions the answer decoration | `insertMarkdownBlock` / `position` | `web/src/plugins/shell/markdown-block.ts` |
| Decides whether the answer needs the marker's row kept clear | `writeShellReply` | `web/src/plugins/shell/write-shell-reply.ts` |
| Drives running/link views and the settle callback | `reply-markers.ts` / `useShellReplyWriters.ts` | `web/src/plugins/shell/reply-markers.ts`, `web/src/plugins/shell/useShellReplyWriters.ts` |
| Unit coverage of the block writer and the reply writer | `markdown-block.test.ts`, `write-shell-reply.test.ts` | `web/src/plugins/shell/` |
| User-visible behavior of the marker and answer placement | the core ACP paragraph and the marker paragraph | `product/specs/shell-tab.md` |

## Proposed changes

**`web/src/plugins/shell/markdown-block.ts`.** In `insertMarkdownBlock`, when `reserveRow` is true, prefix the block's terminal write with two `\r\n` instead of one: one reserves the row the thinking marker occupies, the second leaves an empty row between that marker and the answer. Update the adjacent comment to say so. The callback still registers its decoration marker on the last reserved row, so `position()` lands the block on the first reserved row and nothing else about placement changes.

**Files and limits.** One production file changes, well under the 200-line `max-lines` cap. No new modules, no wire-contract changes, no CSS changes.

## Tests

**Web** (vitest project `client`, colocated `*.test.ts`):
- `web/src/plugins/shell/markdown-block.test.ts` (existing — extend the reserve cases):
  - with `reserveRow`, the terminal write starts with two `\r\n` before the head and reserved rows, so one row is blank between the marker and the block;
  - with `reserveRow`, the block decoration's top sits two rows lower than without it;
  - without `reserveRow`, the write and placement are unchanged.
- Mirror the existing fake-terminal helpers and assertion style; no new test file.

## Out of scope

- The marker's label, spinner, icon, tooltip, accessible name, click behavior, or lifetime.
- The marker's own next-line placement, and the answer's Markdown rendering.
- Replies without a thinking marker, the connections popup, and CSS styling of `.shell-thinking-marker` or `.shell-output-block`.

## Verification

- Run `$janissary/scripts/run.mjs check-diff` and confirm lint, typecheck, and the affected `client` tests pass.
- Update the answer-placement statement in `product/specs/shell-tab.md` and the matching user documentation so they record the blank row between the `see thought process` link and the answer.
- Manual check: run an `ask` in a shell tab and confirm the command, then `Thinking` + spinner on the next line, then once settled a `see thought process` link, a blank row, and the answer reading cleanly below it.
