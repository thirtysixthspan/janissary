<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's repeatable skill clause in agent help.

Existing Issue: `help/agent.md` shows `[with skill <name>]` only once even though the agent launch grammar permits repeating that clause to select multiple skills. Severity: 4/10

Existing Risk: 3/10 - Users may miss the ability to combine skills in one launch and repeat work or settle for a single skill.

Proposal Risk: 1/10 - Marking the clause as repeatable and showing a multi-skill example exposes the supported form, with only the risk of later help-text drift.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1799 "document repeatable skills in agent help". Mark the `with skill <name>` clause as repeatable in the Usage block of `help/agent.md` and add an example with two skill clauses. `product/specs/agent-command.md` describes repeated skill clauses, while `src/agent/command-parser.ts` parses them and deduplicates repeated names; `src/agent/command-parser.test.ts` covers multiple clauses and deduplication. No test pins help wording, so compare the updated signature and example directly with those cases.
