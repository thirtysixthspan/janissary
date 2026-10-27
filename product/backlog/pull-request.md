<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Preserve placeholder arguments in the malformed-layout usage reply shown in the command bar.

Existing Issue: Every invalid layout command displays a usage reply with its `<width>`, `<height>`, and `<percent>` placeholders missing. Severity: 4/10

Existing Risk: 4/10 - Users who mistype layout commands see an incomplete syntax guide and may need to consult help to recover.

Proposal Risk: 2/10 - A later markdown-rendering change could still strip angle-bracket examples from other plain-text command replies.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1801 "preserve placeholders in layout usage replies". Reproduce description step D12 by starting the branch in a scratch project, opening it in the attached browser, and entering `layout window 0 900`, `layout split 100`, `layout reporting 101`, and `layout sidebar center 300` in the janus command bar. The description expects each to print exactly `Usage: layout window <width> <height> | sidebar left|right <width> | split <percent> | reporting <percent> | show.`; the browser instead displays `Usage: layout window | sidebar left|right | split | reporting | show.` for each command, reproduced on two fresh app sessions (2/2). `parseLayoutCommand` in `src/commands/parse-layout.ts` returns the full `LAYOUT_USAGE`, and `command.run` in `src/commands/layout.ts` appends it for parse errors. `useShellSubmit` in `web/src/plugins/shell/useShellSubmit.ts` sends the reply to `insertMarkdownBlock` in `web/src/plugins/shell/markdown-block.ts`, which uses `renderMarkdown` in `web/src/shared/transcript/markdown.ts`; Marked interprets the angle-bracket placeholders as HTML tags and DOMPurify removes them. Escape the placeholders or render the full usage line as code so Markdown preserves the literal arguments. A regression test should submit each malformed command through the shell command bar and assert that the visible reply contains the exact full usage line, including all angle-bracket placeholders.
