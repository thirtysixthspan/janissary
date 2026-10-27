<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Close the functionality gap in the in-app Tab reference for help-page completion.

Existing Issue: `help/keys.md` lists the command-bar Tab completion contexts but does not mention that the first argument after `help` completes from the help-page names. Severity: 3/10

Existing Risk: 3/10 - Users relying on the in-app key reference may not discover that `help pro` can be completed to `help profile`.

Proposal Risk: 1/10 - The in-app reference will explain the new completion, and the separate tab-completion guide and existing completion tests already cover the same behavior.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1799 "document help-page completion in the in-app Tab reference". Update the command-bar `Tab` row and the closing completion paragraph in `help/keys.md` to state that the first argument after `help` completes from the available help-page names, including `commands` and `keys`, and that an unmatched prefix offers no candidates. Keep the wording consistent with `product/specs/tab-completion.md` and `documentation/user-documentation/command-bar/tab-completion.md`; `src/completion/handlers.test.ts` and `src/completion/index.test.ts` already cover the behavior, so preserve those tests without adding a wording-only assertion.


* Remove the introduced technical debt in the help parser's stale section comment.

Existing Issue: The comment above `parseHelpCommand` in `src/commands.ts` says the query names a section, although section lookup was removed and the query now selects a help page. Severity: 2/10

Existing Risk: 3/10 - A maintainer may preserve or reintroduce section-lookup behavior because the comment beside the parser still describes that removed contract.

Proposal Risk: 1/10 - The corrected comment will describe page lookup and leave no obsolete section contract beside the parser.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1799 "correct the stale help parser comment". Update only the comment above `parseHelpCommand` in `src/commands.ts` to describe its page query while retaining the note that `helper` is not a help command. Compare the comment with `helpText` and the existing help-query cases in `src/commands.test.ts`; no test change is needed for a comment-only correction.
