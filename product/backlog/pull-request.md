<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the pull request description's claim that an unowned command always corrects the whole reply, which holds only for core sessions.

Existing Issue: The description's design-decisions paragraph groups an unowned command with empty, multiple-command, and unclosed blocks as malformed input that "corrects the whole reply and runs nothing" for every consumer, but in agent runs a recognized ungranted command is kept as an ordinary batch member and refused on its own while the rest of the batch runs. Severity: 3/10

Existing Risk: 2/10 - A reviewer or downstream reader trusting the description expects whole-reply correction in agent runs and is contradicted by the per-command refusal the code and the agent-command spec actually implement.

Proposal Risk: 1/10 - No behavior changes, so the only residual risk is a future edit reintroducing the blanket wording; a reader comparing the description with the agent-command spec surfaces it.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2137 "scope the description's unowned-command correction claim to core sessions". In the pull request body's design-decisions paragraph, rewrite the sentence beginning "Any malformed block" so the empty-block, multiple-command, and unclosed-fence cases stay whole-reply corrections shared by core sessions and agent runs, while an unowned command is a whole-reply correction only for core sessions, where toolExtractor in src/acp/tool-table.ts rejects the reply when no granted tool owns every command, and a per-command refusal in agent runs, where the raw extractCommandBlock in src/acp/command-block.ts keeps a recognized ungranted command and the agent gate refuses it on its own while the rest of the batch continues, as described in product/specs/agent-command.md. Keep the "no janissary block is a final answer" clause and every quoted string verbatim, and change no code, tests, specs, or behavior. Verify by direct comparison against driveToolLoop's extractor selection in src/acp/drive-loop.ts, toolExtractor in src/acp/tool-table.ts, extractCommandBlock in src/acp/command-block.ts, and the Local task execution paragraph of product/specs/agent-command.md; no test covers this prose, and the existing extraction and loop tests must remain untouched.
