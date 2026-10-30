# Read formatted Markdown in the transcript

Read ACP replies and `help` output as formatted GitHub-flavored Markdown in the transcript. You can read headings, lists, tables, task lists, fenced code blocks, blockquotes, links, and horizontal rules without leaving the tab. Everything is colored to match the transcript around it, so headings, inline and fenced code, bordered tables, lists, blockquotes, rules, and links all read as part of the app rather than as a web page dropped into it. A single newline inside a paragraph starts a new line instead of running on, so a reply that hard-wraps its own prose still comes out one line per line of the source.

<img class="agent-float" src="/agents/hakim-south-east.png" alt="" />

## See formatting as the reply arrives

When you use `acp <prompt>`, the reply renders while the agent writes it, with your prompt remaining above it. The app keeps each Markdown reply together, so multi-line lists, tables, and fenced code blocks keep their structure. A partial table or code fence can look unfinished during the turn and settle as more text arrives.

Replies come back structured because the app asks for that before your prompt reaches the agent. Every `acp` prompt is prefixed with an instruction to answer in GitHub-flavored Markdown, naming headings, lists, tables, and fenced code blocks. The agent's prose is rendered as Markdown because of that instruction; ordinary command output remains plain text. Automatic `db`, `browser`, and `question` tool steps remain plain text and appear as collapsed command/result entries. Consecutive steps share one summary. Empty continuation turns between steps don't split the group or add to its count, but a visible reply or message does start a new group. Your prompt and the agent's final answer stay visible. Click a tool-step summary to inspect it; `Ctrl+T` also works while the ACP panel has focus. Shell output, database results, browser results, and inter-agent messages also remain plain text.

<img class="agent-float left" src="/agents/yusuf-south-west.png" alt="" />

## Read autonomous-agent activity

In an autonomous-agent monitor tab, the agent's message activity renders as Markdown. Other activity, such as commands and results, stays plain text. This is separate from the periodic `monitor` command and its suggestion feed; see [Monitoring with personas](/user-documentation/automation/monitoring).

## Follow source locations

Regular transcript output and Markdown replies turn text like `src/app.ts:42` into a file link when the path contains `/` or `\` before the line number:

```
src/app.ts:42
```

A single click opens the file in an editor at the named line. A value like `error:42` has no path separator, so it isn't a file link. Links beginning with `http://` or `https://` open through the app's page-opening behavior. A web address with a port, such as `http://localhost:3000`, stays a web link. A URL ending in `:42` also opens as a web page instead of a file-and-line reference. Other Markdown links keep their normal link behavior. In a docked shell's ACP panel, a link opens from the shell that owns the panel, as described in [Query ACP from a shell](/user-documentation/advanced-agents/acp-agent).

Color, bold, and underline styling in shell output appears while a command runs and after it finishes. A file-and-line reference in a colored shell-output line stays clickable. Terminal control sequences such as cursor movement and clearing a line are omitted from the transcript.

## Use safe links and markup

The app removes active HTML from agent output before it displays the result. Scripts and event handlers do not run. Safe Markdown links remain available, and a parse failure displays the reply as plain text.

The `help` command is formatted Markdown. Use `help` for the command list and `help keys` for the key bindings.
