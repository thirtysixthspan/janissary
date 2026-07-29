# Read formatted Markdown in the transcript

ACP replies and the `help` output appear as formatted GitHub-flavored Markdown in the transcript. You can read headings, lists, tables, task lists, fenced code blocks, blockquotes, links, and horizontal rules without leaving the tab.

<img class="agent-float" src="/agents/hakim-south-east.png" alt="" />

## See formatting as the reply arrives

When you use `acp <prompt>`, the reply renders while the agent writes it. The app keeps each Markdown reply together, so multi-line lists, tables, and fenced code blocks keep their structure. A partial table or code fence can look unfinished during the turn and settle as more text arrives.

ACP replies are the agent's prose. Automatic `db` and `browser` tool steps remain plain text and appear as collapsed command/result entries. Expand one with `Ctrl+T` to inspect it. Shell output, database results, browser results, and inter-agent messages also remain plain text.

<img class="agent-float left" src="/agents/yusuf-south-west.png" alt="" />

## Follow source locations

The transcript turns paths with line numbers into links when the text includes a path separator:

```
src/app.ts:42
tests/test.py:10:5
```

Select a link to open that file in an editor at the indicated line. A `file:line:column` link also opens at its line; the column is not used as the editor position. A bare value such as `error:42` is not treated as a file link.

## Use safe links and markup

The app removes active HTML from agent output before it displays the result. Scripts and event handlers do not run. Safe Markdown links remain available, and a parse failure displays the reply as plain text.

The `help` command is formatted Markdown. Use it whenever you need the current command or key-binding list.
