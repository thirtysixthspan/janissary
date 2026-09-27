<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Close the gap that the column types are inferred and never shown, where every comparable product puts the inferred schema in front of the user before querying it.

Existing Issue: `src/visualizations/table.ts` infers each column's type and `product/specs/visualizations.md` never mentions where the user sees or corrects it, because nothing renders the schema — the tab goes from "Reading the source…" straight to the model's first question. Severity: 6/10

Existing Risk: 6/10 - A column of numbers written with thousands separators or a currency symbol is inferred as text, the model is told it is text, and the whole interview is built on a type nobody ever showed the user or could have corrected.

Proposal Risk: 3/10 - A correction lets a user assert a type the parser did not believe, so the parser and the assertion have to be reconciled rather than one silently replacing the other, and a bad assertion produces a chart the model was never warned about.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1440: show the inferred columns and let a type be corrected before the interview". Render the table's columns and their inferred types in the region `web/src/plugins/visualizations/VisualizationBody.tsx` already uses for "Reading the source…", in the same shape Wren AI's CSV upload review step uses: every column with its name and type, and a control to change a type among number, boolean, text, and date. Send the correction as a topic action through `src/plugins/api-topics.ts` and `src/plugins/topics.ts` alongside the actions already there, and apply it in `src/visualizations/table.ts` so the stored table and everything downstream read the corrected type rather than a parallel one. The interview must not begin until the schema has been shown, so a correction arrives before any question is asked, which is the whole point of the step. Add a paragraph to `product/specs/visualizations.md` describing it, and cases to `web/src/plugins/visualizations/VisualizationTab.test.tsx` and `src/visualizations/table.test.ts` for a corrected type reaching the marks. Sources: https://docs.getwren.ai/cp/guide/connect/csv , https://julius.ai/docs/get-started/understanding-the-chat-interface
