# Scope the description's unowned-command correction claim to core sessions

**Complexity: 1/10** — a description-only correction. No code, tests, spec, help, or user-documentation changes. The only repository edits are the plan and the pull-request backlog; the body of pull request #2137 is corrected after the push. Every quantitative count is zero, giving p=1.578.

## Goal

Make the design-decisions paragraph in the body of pull request #2137 match what the code and `product/specs/agent-command.md` actually implement: empty, multiple-command, and unclosed-fence blocks correct the whole reply for core sessions and agent runs alike, but an unowned (recognized ungranted) command corrects the whole reply only for core sessions and is refused on its own in agent runs while the rest of the batch runs. The title and every other paragraph stay as the author wrote them.

## Problem

The sentence beginning "Any malformed block" groups four cases — an empty block, more than one command in a block, an unowned command, or an unclosed labelled fence — as malformed input that "corrects the whole reply and runs nothing" for every consumer. That is wrong for agent runs.

- `driveToolLoop` in `src/acp/drive-loop.ts` selects `toolExtractor(tools)` when `snapshot.kind === 'core'`, but the raw `(text) => extractCommandBlock(text, snapshot.askUser)` otherwise.
- `toolExtractor` in `src/acp/tool-table.ts` rejects the whole batch as `{ kind: 'mistake', commands: 1 }` when no granted tool owns every command. That is the core-session whole-reply correction.
- `extractCommandBlock` in `src/acp/command-block.ts` keeps any recognized command block without a grant check; an empty block, a block with zero or more than one command start, or an unclosed labelled fence still yields a whole-reply mistake. Those cases are shared by both session kinds.
- For agent sessions, `gateAgentCommand` in `src/acp/tool-table.ts` returns a per-command refusal (`Agent: command not permitted: <command>.`) that `gatedRunner` delivers as that command's own result while the rest of the batch continues.
- The Local task execution paragraph of `product/specs/agent-command.md` states this split verbatim: the parser cases "apply to core sessions and agent runs alike," the unowned-command case "applies only to core sessions," and agent runs extract a recognized ungranted command as an ordinary batch member and refuse it on its own while the remaining commands run.

No test covers this prose, and the extraction and loop tests need no change.

## Decision

Rewrite only the sentence beginning "Any malformed block" in the design-decisions paragraph.

- Keep the em-dash list items "an empty block", "more than one command in a block", and "an unclosed labelled fence" as whole-reply corrections that run nothing in both core sessions and agent runs.
- Keep the clause "while a reply with no `janissary` block remains a final answer".
- Move "an unowned command" out of that shared list and state it separately: a whole-reply correction only for core sessions, where `toolExtractor` in `src/acp/tool-table.ts` rejects the reply when no granted tool owns every command; and a per-command refusal in agent runs, where the raw `extractCommandBlock` in `src/acp/command-block.ts` keeps a recognized ungranted command as an ordinary batch member and the agent gate refuses it on its own while the rest of the batch continues, as described in `product/specs/agent-command.md`.
- Keep every quoted string in the sentence verbatim, including `janissary` and the phrase "corrects the whole reply and runs nothing".

## Changes

### Pull request body, applied after the push

- Read the current body with `gh pr view <reference> --json body`, replace only the named sentence, write the full body to `./temp/pr-body.md`, and apply it with `gh pr edit <reference> --body-file ./temp/pr-body.md`. Every other paragraph stays byte-for-byte; the title and change-set statistics are not touched.

### Backlog

- `product/backlog/pull-request.md`: the only entry is removed whole, restoring the file to the comment-and-heading skeleton.

### Plan

- This plan moves from `draft/` to `ready/` to `complete/`.

## Tests

None added. The change is to prose in a pull request body plus plan and backlog files, and it changes no behavior. Verification is a direct comparison against `driveToolLoop`'s extractor selection in `src/acp/drive-loop.ts`, `toolExtractor` in `src/acp/tool-table.ts`, `extractCommandBlock` in `src/acp/command-block.ts`, and the Local task execution paragraph of `product/specs/agent-command.md`. The existing extraction and loop tests remain untouched. `$janissary/scripts/run.mjs check-diff` gates the repository change.

## Spec

`product/specs/agent-command.md` is unchanged. Its Local task execution paragraph already states the exact core-versus-agent split that the corrected sentence now describes.

## Docs

None needed. No help or user-documentation file describes this prose, and no behavior changes.

## Out of scope

- Any source, test, spec, config, help, or user-documentation change.
- The pull request title and every description paragraph other than the named design-decisions sentence.
- The configurable `maxToolSteps()` default of 20, which is already reflected in the description.
- `product/backlog/issues.md`.
