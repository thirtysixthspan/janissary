<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Remove the introduced technical debt in the help parser's stale section comment.

Existing Issue: The comment above `parseHelpCommand` in `src/commands.ts` says the query names a section, although section lookup was removed and the query now selects a help page. Severity: 2/10

Existing Risk: 3/10 - A maintainer may preserve or reintroduce section-lookup behavior because the comment beside the parser still describes that removed contract.

Proposal Risk: 1/10 - The corrected comment will describe page lookup and leave no obsolete section contract beside the parser.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1799 "correct the stale help parser comment". Update only the comment above `parseHelpCommand` in `src/commands.ts` to describe its page query while retaining the note that `helper` is not a help command. Compare the comment with `helpText` and the existing help-query cases in `src/commands.test.ts`; no test change is needed for a comment-only correction.
