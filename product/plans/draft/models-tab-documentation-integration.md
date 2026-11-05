# Models tab documentation and integration

**Complexity: 3/10** — this closes the user-facing help and documentation gaps and runs the planned end-to-end acceptance flow across already implemented slices.

## Goal

Finish the feature's public help and user documentation, reconcile remaining cross-feature descriptions with the delivered behavior, and verify the completed models workflow in a scratch project.

## Decisions and dependencies

- Depends on all preceding models catalog, host topic, models tab, and roles subplans.
- Help pages are the source for generated command reference pages. Do not edit generated documentation output.
- User documentation is written for a Janissary user and must not include internal module names or implementation paths.
- The full feature's `models-tab` spec, harness, roles, ACP, notification, and tab-plugin specs are created or updated by their implementation subplans. This plan updates only remaining descriptions needed for a coherent public workflow.

## Existing code and docs to reuse

| Need | Existing page |
| --- | --- |
| Help table conventions | `help/commands.md` and `src/commands.test.ts` |
| Roles help and user docs | `help/roles.md` and `documentation/user-documentation/tab-types/roles.md` |
| Conversation model-source description | `documentation/user-documentation/tab-types/conversations.md` |
| User documentation structure | `documentation/user-documentation/tab-types/` and `ai/guidelines/user-documentation.md` |

## Proposed changes

1. Add `help/models.md` with the command syntax, center/left/right behavior, provider grouping, Refresh and Delete actions, and key exact user-visible messages. Add the `models` command row in alphabetical order in `help/commands.md` and update `help/roles.md` for the removed catalog column.
2. Add `documentation/user-documentation/tab-types/models.md`. Update the roles tab page to explain role editing without a catalog column and the “Not in the model catalog” tooltip; update the conversations page's description of where its model choices come from.
3. Review affected help and user-doc sections against the final code and specs; correct any remaining stale wording without widening feature scope.
4. Perform the final scratch-project acceptance flow from the source plan: open `models` and confirm the provider groups, four columns, Refresh, and split controls; dock with `models left` and confirm the two-line rows and dock-cycle control; return to center with bare `models`; cancel and then confirm Delete; inspect `.janissary/known-models.json` to confirm the record remains with both true flags; and confirm `harness claude --model <deleted-id>` is refused. Open `roles` and confirm its catalog column is gone and a retained entry is dimmed with title `Not in the model catalog`. With the notifications feed closed, click Refresh and confirm the spinner, update, and toast. Repeat after unsetting `ANTHROPIC_API_KEY` and confirm `claude skipped: ANTHROPIC_API_KEY is not set.` while the Anthropic group stays unchanged. Also check `models` with an empty visible catalog, an invalid argument, and hand-edited catalog changes taking effect on the next command. Use only scratch state and installed providers; do not include credentials in documentation or screenshots.

## Tests and verification

Run `$janissary/scripts/run.mjs check-diff` after each documentation change that affects tracked code-like files, and at the end run `$janissary/scripts/run.mjs check-diff`. Confirm `src/commands.test.ts` accepts the alphabetical help row and that every manual expectation matches the final specs. Do not run `npm run check`.

## Out of scope

- Source or test behavior changes; if acceptance reveals a code defect, stop this documentation subplan and add a separately planned repair before resuming it.
- Screenshots, publishing or merging the PR, generated Command Reference output, or changes to unrelated help pages.
