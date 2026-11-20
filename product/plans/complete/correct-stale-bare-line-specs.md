# Correct stale bare-line spec text

**Complexity: 1/10** — prose-only spec alignment: no production code, tests, new modules, or behavioral requirements, and no file-size pressure (p=1.58).

## Goal

Several functional specs still quote the pre-change bare-final-line primer blocks as verbatim "exact text" and still describe a command on a bare final line as extracted, gated, and run. The labelled-block extractor now runs the one command inside a final fenced block whose info string is exactly `janissary`; a bare final line is prose that ends the turn, and zero or more than one command in that block draws the shared correction sentence. The specs must match the shipped primers and the loop so a contributor cannot reconstruct the removed behavior from a stale "exact text" block.

## Approach

Replace only the first line of each quoted primer block with the current first line of the corresponding runtime primer constant, leaving every grammar, guidance, and example line byte-for-byte. Rewrite only the narrative sentences that still teach bare-final-line extraction, reusing the wording already pinned in `product/specs/acp.md`'s loop and tool-table paragraphs, `product/specs/agent-command.md`, and the runtime primers, so specs, primer strings, and implementation agree. Change no behavior, source, or test: `src/acp/command-block.test.ts` and the per-tool primer tests already pin the real behavior.

## Implementation steps

1. In `product/specs/acp.md`, replace the first line of the ten quoted primer blocks that open with "end your reply with one line:" with the current first line of the matching primer constant, keeping the rest of each block byte-for-byte: file read from `src/file-read/command.ts`, file glob from `src/file-glob/command.ts`, file grep from `src/file-grep/command.ts`, web search from `src/web/search/command.ts`, web fetch from `src/web/fetch/command.ts`, file patch from `src/file-patch/command.ts`, and file stat, file exists, file head, and file tail from `src/acp/file-primer.ts`. Each replacement line says "put exactly one command inside a final fenced block whose info string is exactly `janissary`. Write the command without a `janissary` prefix; prose may follow the block."

2. In `product/specs/acp.md`, rewrite the narrative sentences that still teach bare-final-line extraction: the Web search sentence saying only a lowercase `web search` line is taken as a command and a bare line is extracted and answered with usage; the Web fetch sentence saying either web grant makes both web reply lines recognised and a bare `web fetch` line is answered with usage; the File list paragraph saying the primer tells the agent to end its reply with one `file list <path>` line and that a session ending its reply with that line runs it; and the stat/exists/head/tail sentences saying a session ending its reply with one of those lines runs it and that a bare line is recognized, gated, and answered rather than becoming the final answer. Each must instead say the command goes in a final `janissary` block, a bare final line is prose that ends the turn, and zero or more than one command draws the shared correction sentence. Keep every other sentence in those paragraphs unchanged.

3. In `product/specs/web-fetch.md`, rewrite the sentence saying the agent ends its reply with a typed `web fetch` line, the first line of the quoted primer block introduced by "Its exact text is:", and the sentence saying a bare `web fetch` line is extracted like any other command and answered with the usage line, to the same labelled-block rule.

4. In `product/specs/agent-questions.md`, rewrite the two sentences saying an agent issues `question ask` or `question approve` on its own final response line to the same labelled-block rule.

5. The verification sweep also finds one stale ACP-path claim in `product/specs/web-search.md`: the sentence saying the agent asks for a search by ending its reply with one `web search` line and that a bare `web search` line is a command answered with usage. Rewrite that sentence to the same labelled-block rule so the sweep can confirm no remaining hit teaches bare-final-line extraction on the ACP or agent command path.

6. Sweep `product/specs` for "end your reply with one line", "own final line", "own final response line", "A bare", and "ends its reply with" and confirm no remaining hit teaches bare-final-line extraction for the ACP or agent command path. Run `$janissary/scripts/run.mjs check-diff` and keep the full server suite green. Promote this plan to `complete/` and remove the resolved backlog entry, restoring the master skeleton when the backlog drains.

## Tests

No new tests: the change is documentation only. Confirm `src/acp/command-block.test.ts` and the per-tool primer tests remain untouched and pass, and that `$janissary/scripts/run.mjs check-diff` reports a green full server suite.

## Spec and documentation

Update `product/specs/acp.md`, `product/specs/web-fetch.md`, `product/specs/agent-questions.md`, and `product/specs/web-search.md` as described above. No help pages or user documentation describe the stale primer text, so none need editing.

## Out of scope

Changing any source, test, behavior, primer constant, PR description, or spec sentence not named above; adding new documentation; merging or closing the PR.
