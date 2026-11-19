# Keep the shell thinking marker off the answer line

**Complexity: 3/10** — ~8 added lines across 2 production files, 4 behavioral requirements and 6 test scenarios, no new modules or wire types (p=4.38).

## Summary

Per the backlog: "Thinking <spinner> was recently bumped to the next line, however the Th in Thinking <spinner> is not visible as it should be looking like '  inking <spinner>' instead. 'See though process' also inappropriately overwrites the beginning of the answer on the next line."

An accepted `ask`, `tell`, or `subagent` prompt (and a pending core prompt with an echo) leaves a `Thinking` + spinner decoration on the line below its echoed command, which turns into a `see thought process` link when the answer settles. The decoration is a top-layer xterm marker anchored to the echo's first row and positioned by `place()` in `web/src/plugins/shell/thinking-marker-decoration.ts`. The settled answer is a second top-layer decoration: `insertMarkdownBlock` in `web/src/plugins/shell/markdown-block.ts` reserves rows in the terminal, registers a marker on the last row, and paints `.shell-output-block` over that span. Both decorations land on the same row, the one immediately below the echo. Because the answer block is registered later and shares the top layer, it paints over the earlier marker, covering the marker's leading characters (`Th`) while it runs and the start of its link text once settled.

This change reserves one blank terminal row between the echoed command and the answer whenever a thinking marker is present. The marker keeps its own line; the answer block starts one row lower. Nothing else about the marker or the answer changes.

## Design decisions

- **Give the marker its own row, don't stack decorations.** The answer block is painted over the terminal rows it reserves, and it registers after the marker, so it wins the shared top layer. Dropping the answer's rows one lower removes the overlap at the source rather than fighting z-index (which would only swap which element hides the other).
- **Reserve the row in the block writer, not the marker.** `insertMarkdownBlock` already owns the rows the answer reserves and positions its decoration from a marker on the last of those rows. Prefixing its write with one `\r\n` moves both the reserved rows and the decoration down by one, with the position math staying correct. The caller tells it whether a marker needs the space.
- **Only when a marker is present.** Replies without a settled thinking marker keep their current placement, so ordinary command output is untouched.
- **Both placement paths.** Whether the answer continues beneath an existing echo or is written under a repeated command line, a settled reply carries `onHeadMarker`, so both get the reserved row.

## What already exists (reuse, don't rebuild)

| Need | Existing thing to reuse | Location |
| --- | --- | --- |
| Builds and positions the thinking marker | `addThinkingMarker` / `place` / `anchorOf` | `web/src/plugins/shell/thinking-marker-decoration.ts` |
| Reserves terminal rows and positions the answer decoration | `insertMarkdownBlock` / `position` | `web/src/plugins/shell/markdown-block.ts` |
| Decides whether the answer needs its own line and hands the marker callback to the block writer | `writeShellReply` | `web/src/plugins/shell/write-shell-reply.ts` |
| Drives running/link views and the settle callback | `reply-markers.ts` / `useShellReplyWriters.ts` | `web/src/plugins/shell/reply-markers.ts`, `web/src/plugins/shell/useShellReplyWriters.ts` |
| Unit coverage of the block writer and the reply writer | `markdown-block.test.ts`, `write-shell-reply.test.ts`, `useShellReplyWriters.test.ts` | `web/src/plugins/shell/` |
| User-visible behavior of the marker and answer | the marker paragraph | `product/specs/shell-tab.md` |

## Proposed changes

**`web/src/plugins/shell/markdown-block.ts`.** Add an optional trailing `reserveRow` boolean to `insertMarkdownBlock` (default `false`). When it is true, prefix the block's terminal write with one `\r\n` so the rows the decoration reserves and the decoration itself start one row below the current cursor. The existing callback registers its marker on the last of those rows, so the block's `position()` continues to land it on the first reserved row. Add a short comment at the prefix explaining that the row is left for the thinking marker.

**`web/src/plugins/shell/write-shell-reply.ts`.** Pass `onHeadMarker !== undefined` as the new `insertMarkdownBlock` argument so the row is reserved only for replies that settle a thinking marker into a link.

**Files and limits.** Two production files change, both well under the 200-line `max-lines` cap. No new modules, no wire-contract changes, no CSS changes.

## Tests

**Web** (vitest project `client`, colocated `*.test.ts`):
- `web/src/plugins/shell/markdown-block.test.ts` (existing — extend with reserve cases):
  - with `reserveRow`, the terminal write starts with an extra `\r\n` before the head and reserved rows;
  - with `reserveRow`, the block decoration's top sits one row lower than without it;
  - without `reserveRow`, the write and placement are unchanged.
- `web/src/plugins/shell/write-shell-reply.test.ts` (existing — extend the settle cases):
  - a reply with `onHeadMarker` asks the block writer to reserve a row;
  - a reply without `onHeadMarker` does not.
- `web/src/plugins/shell/useShellReplyWriters.test.ts` (existing — adjust the one `insertBlock` call assertion for the new argument).
- Mirror the existing fake-terminal helpers and assertion style; no new test file.

## Out of scope

- The marker's label, spinner, icon, tooltip, accessible name, click behavior, or lifetime.
- Changing the next-line placement back to inline, or changing the answer's Markdown rendering.
- The connections popup, CSS styling of `.shell-thinking-marker` or `.shell-output-block`, and documentation that does not already describe this placement.

## Verification

- Run `$janissary/scripts/run.mjs check-diff` and confirm lint, typecheck, and the affected `client` tests pass.
- Update the answer-placement statement in `product/specs/shell-tab.md` so the spec records that the answer sits below the marker row when one is present.
- Manual check: run an `ask` in a shell tab and confirm `Thinking` + spinner show fully at the left edge of the line below the echoed command, the answer starts on the following line, and the settled `see thought process` link neither clips its own leading characters nor covers the answer.
