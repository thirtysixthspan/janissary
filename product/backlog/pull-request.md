<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Render diff command placeholders literally in transcript refusals.

Existing Issue: The no-workspace and usage refusals omit their angle-bracket placeholders when rendered in the transcript. Severity: 3/10

Existing Risk: 3/10 - Users receive an incomplete command hint, though the unknown tab name remains quoted in the no-workspace refusal.

Proposal Risk: 1/10 - If the fix is incomplete, users may still see confusing placeholder text in these refusal messages.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1629 "Render diff command placeholders literally in transcript refusals". Description step D7 says verbatim: `diff on <name>` from another tab's command bar — the same tab opens. `diff on <a tab with no workspace>` reports the no-workspace line. `diff src on <name>` reports the usage line. To reproduce, start the app from a git project, run `zsh -w demir`, wait for its workspace flag, then in the `demir` shell command bar run `diff on no-such-tab` and `diff src on demir`. Expected from the step and `product/specs/diff-tab.md`: `Cannot diff on <no-such-tab>: no open shell or harness tab named "no-such-tab" has a workspace.` and `Usage: diff [path] [on <tab name>]`. Both commands consistently showed the refusals but rendered them as `Cannot diff on : no open shell or harness tab named "no-such-tab" has a workspace.` and `Usage: diff [path] [on ]`. The clause still focuses the existing diff tab. In `src/plugins/diff/activate.ts`, `command` interpolates the placeholders as raw angle-bracket text; `web/src/shared/transcript/transcript-line.tsx`, `Markdown`, passes it through `renderMarkdown` in `web/src/shared/transcript/markdown.ts`, where `marked.parse` treats the placeholders as HTML tags and drops them before DOMPurify sanitizes the markup. The existing `web/src/shared/transcript/markdown.test.ts` confirms bare angle-bracket placeholders are removed. Escape the placeholder delimiters or render placeholders as inline code in both refusal strings. Add a regression test asserting the rendered transcript retains `<no-such-tab>` and `<tab name>` in the two refusal lines.
