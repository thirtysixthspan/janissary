# Read formatted Markdown in the transcript

ACP replies and the `help` output appear as formatted GitHub-flavored Markdown in the transcript. You can read headings, lists, tables, task lists, fenced code blocks, blockquotes, links, and horizontal rules without leaving the tab. Everything is colored to match the transcript around it, so headings, inline and fenced code, bordered tables, lists, blockquotes, rules, and links all read as part of the app rather than as a web page dropped into it. A single newline inside a paragraph starts a new line instead of running on, so a reply that hard-wraps its own prose still comes out one line per line of the source.

<img class="agent-float" src="/agents/hakim-south-east.png" alt="" />

## See formatting as the reply arrives

When you use `acp <prompt>`, the reply renders while the agent writes it. The app keeps each Markdown reply together, so multi-line lists, tables, and fenced code blocks keep their structure. A partial table or code fence can look unfinished during the turn and settle as more text arrives.

Replies come back structured because the app asks for that before your prompt reaches the agent. Every `acp` prompt is prefixed with an instruction to answer in GitHub-flavored Markdown, naming headings, lists, tables, and fenced code blocks. The agent's prose is rendered as Markdown because of that instruction; nothing else in the transcript goes through the same rendering. Automatic `db` and `browser` tool steps remain plain text and appear as collapsed command/result entries. Expand one with `Ctrl+T` to inspect it. Shell output, database results, browser results, and inter-agent messages also remain plain text.

<img class="agent-float left" src="/agents/yusuf-south-west.png" alt="" />

## Follow source locations

The transcript turns paths with line numbers into links when the text includes a path separator:

```
src/app.ts:42
tests/test.py:10:5
```

A single click on a link opens that file in an editor with the target line scrolled to the middle of the tab, so the line and its surroundings are in view without scrolling. A `file:line:column` link also opens at its line; the column is not used as the editor position. A bare value such as `error:42` is not treated as a file link.

## Use safe links and markup

The app removes active HTML from agent output before it displays the result. Scripts and event handlers do not run. Safe Markdown links remain available, and a parse failure displays the reply as plain text.

The `help` command is formatted Markdown. Use it whenever you need the current command or key-binding list.
