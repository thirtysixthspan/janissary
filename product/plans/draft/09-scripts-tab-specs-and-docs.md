# Scripts tab specs and docs
**Complexity: 2/10** — one new behavior spec, pointers in the existing specs, a help row, a user-doc row and paragraph, the topic entries in the plugin docs, and the stale topic count in the plugin guideline fixed.

## Goal

Write the behavior spec for the tab and update every doc the source plan names. Also update the docs the plugin checklist and the spec rules require, so that the docs match the code once `08` lands.

## Design decisions and dependencies

This subplan depends on `08-scripts-plugin-registration`, so the spec describes the code that exists and not a plan for it.

- `product/specs/scripts-tab.md` is the behavior spec. It lists the exact text of every feed line, every dialog line, and every button label, copied from the source plan. It covers the edge cases as their own section: an invalid name, a missing row, a clone whose name is taken, a symlinked or non-regular file, an empty or missing directory, a symlinked `.janissary`, a delete while an editor tab holds the file, and a save of that tab after the delete. Save recreates the file through the editor's existing save path. That claim is to be verified in `10`. The spec also records the refresh ceiling and its upgrade path: if the tick ever shows up in profiles, the refresh moves to the state broadcast. It names the implementation (`ScriptsTab`, the `runscripts` topic, `runRunscriptNow`, `ensureDirectory`) as the developer style requires.
- `product/specs/scheduling.md`, the runscripts paragraph at line 13, gets a pointer to `[[scripts-tab]]`. The exclusion paragraph at line 15 gets one clause: the scripts tab runs the exclusion step when it opens and does not repeat it on each refresh tick. Without that clause, the spec would say that cataloging always ensures exclusion while the tab's tick reads without that step. The source plan does not ask for this clause, so it is an addition made for accuracy.
- The `help.md` Commands table gets a `scripts` row between `schedules` and `search`, which keeps the table alphabetical, as `src/commands.test.ts` checks. The row text is a proposal: `Open the project's runscripts in .janissary/scripts. Run, duplicate, or delete one from its row, or create one with **+**.` It must stay under 200 characters.
- `documentation/user-documentation/command-bar/commands.md` gets a `scripts` row in its table. Its section `edit and execute runscripts` gets one sentence that points at the tab and describes the three row buttons and double-click, in user terms. The page names no files and no functions.
- `documentation/developer-documentation/tab-plugins.md` changes the sentence that says v2 defines five topics to six, with `runscripts` named in the list. The paragraph on topic actions gains one sentence for the runscripts actions. The API changelog gets an entry: the new topic is additive, and `TAB_PLUGIN_API_VERSION` stays at 2. The changelog entry is required by the plugin checklist. The assertion in `src/plugins/documentation.test.ts` about the changelog's capability count keeps passing, since no capability is added.
- `product/specs/tab-plugins.md`, the paragraph that lists topic actions by kind (around line 119), gets the runscripts actions in one sentence. The source plan does not list this file, but the plugin checklist requires the spec to describe the behavior.
- `ai/guidelines/plugins-tabs.md`, the sentence that says "v2 defines four topics", is stale. The code, `src/plugins/api-topics.ts`, and the developer docs say five before this change and six after it. It is fixed here. This is a one-line correction, and the source plan does not list it.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Runscript and scheduling spec | `product/specs/scheduling.md` (runscripts paragraph, exclusion paragraph, Scheduling tab section) | Pointer and one clause added. |
| Help table | `help.md` (Commands table) | One row added in alphabetical order. |
| Help ordering test | `src/commands.test.ts` | Checks the new row's position. |
| User command reference | `documentation/user-documentation/command-bar/commands.md` | One row and one sentence added. |
| Developer plugin reference | `documentation/developer-documentation/tab-plugins.md` (topic paragraph, topic action paragraph, changelog) | Updated. |
| Developer doc assertions | `src/plugins/documentation.test.ts` | Must keep passing. |
| Tab plugin spec | `product/specs/tab-plugins.md` (topic action paragraph) | One sentence added. |
| Plugin guideline | `ai/guidelines/plugins-tabs.md` (topic sentence) | Count corrected. |

## Proposed changes

- Create `product/specs/scripts-tab.md`. Its sections are: purpose and command; the tab's rows; the live list and the refresh ceiling; row actions; keyboard; the create, clone, delete, and execute behaviors; the failure text table; edge cases; and out of scope. The wording is verbatim from the source plan. The spec lists each feed line and each dialog line once, and says which action produces it.
- Edit `product/specs/scheduling.md` as described above.
- Edit `help.md`, `documentation/user-documentation/command-bar/commands.md`, `documentation/developer-documentation/tab-plugins.md`, `product/specs/tab-plugins.md`, and `ai/guidelines/plugins-tabs.md` as described above.
- Keep each file within its current style. Use natural line breaks, and do not add em dashes to prose.

## Tests

No new test files. The existing ordering test in `src/commands.test.ts` and the developer doc assertions in `src/plugins/documentation.test.ts` must pass. Before finishing, check the spec's verbatim strings against the code with a plain search. Each string must appear once in the spec and in the code, with the same text: the execute failures, the clone, delete, and create failures, the empty state, the dialog title and lines, the button labels, and the tooltips.

## Verification

Run `./scripts/run.mjs check-diff`. Read the new spec once against the source plan and confirm that no requirement from the source is missing. Confirm that `help.md` rows stay in alphabetical order, and that the new help row is under 200 characters.

## Out of scope

- A user documentation page of its own. The command reference is enough for a command that has one tab and no settings. A screenshot is not needed.
- The docs-screenshots tooling.
- Any change to code. If the spec finds a gap in the code, the gap goes back to the subplan that owns it.
