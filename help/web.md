### web

Search the web through a configured provider and print the results as a Markdown list. A local tab searches on the machine running Janissary. A remote tab searches on the remote machine, in that tab's workspace, and never falls back to the local machine. A typed search has no cancellation: it runs until it answers or every provider it tries times out. A search run by an `ask` or `tell` agent is cancelled with its prompt: the in-flight provider request is aborted, no further provider is tried, and its late result is suppressed; a local-fallback session's remote search has no cancel message, so only the late result is suppressed.

**Usage**

`Usage: web search <query> [--results <1-20>] [--max-chars <200-100000>] [--depth basic|advanced] [--provider <name>]`

The query is everything after `web search` up to the first word that starts with `--`, with each run of whitespace collapsed to one space. Quotes and operators such as `site:` and `-site:` are kept as typed and sent to the provider, so `"exact phrase"` works. The flags follow the query in any order.

- `--results` is the number of results to keep, from 1 to 20, and defaults to 10. A provider may return fewer.
- `--max-chars` is the character budget for the printed list, from 200 to 100000, and defaults to 10000.
- `--depth` is `basic` or `advanced`, matched case-insensitively, and defaults to `basic`. `advanced` costs more on Tavily and is ignored by TinyFish.
- `--provider` names the provider to use and defaults to `auto`. Names are matched case-insensitively.

**Output**

The output is a Markdown list with no header line. Each result is a `- [<title>](<url>)` line, with its snippet on the next line indented two spaces. A result with no snippet prints only its link line. At most `--results` results are printed, and a result whose URL is not an absolute HTTP or HTTPS URL is dropped.

Before printing, each run of whitespace in a title or snippet becomes one space and the ends are trimmed. `[`, `]`, and `\` in a title are escaped, and spaces and parentheses in a URL are percent-encoded. An empty title is replaced by the URL. Two results whose URLs match after ignoring case of the scheme and host, dropping a `#fragment`, and dropping one trailing `/` from the path are duplicates, and the first is kept.

When results do not all fit within `--max-chars` and the first result's link line leaves room for the note, the list ends with `(showing <k> of <n> results; raise --max-chars for more)`. The first result always appears; its snippet is cut and ends in `…` when needed, the note is dropped when it cannot fit alongside the link line, and a link line too long for the budget prints whole with no snippet.

A successful search that kept no results prints `No results for "<query>".`, with the query as sent. That is an answer, not a failure.

**Errors**

Every malformed line prints `Usage: web search <query> [--results <1-20>] [--max-chars <200-100000>] [--depth basic|advanced] [--provider <name>]` and sends nothing. That covers bare `web`, bare `web search`, an empty query, an unknown or repeated flag, a flag with no value, a `--results` or `--max-chars` outside its range or not a whole number, a `--depth` other than `basic` or `advanced`, and a word after the flags that is not a flag's value.

A search prints one of these lines when it cannot answer:

- `Web search: no provider configured.` when no provider has a token.
- `Web search: provider "<name>" is not configured.` when the named provider has no token.
- `Web search: unknown provider "<name>" (available: auto, tavily, tinyfish).` when the name is not a registered provider.
- `Web search failed (<name>): <reason>.` when exactly one provider was tried and failed.
- `Web search: every provider failed.` followed by one `- <name>: <reason>` line per attempt, when more than one provider was tried and all failed.

A reason is `HTTP <status> <status text>`, `timed out after 30 s`, `invalid response`, the first line of a network error, `provider failed: <first line>` when a provider plugin breaks, or `requires provider API <n>` when it expects another provider API version. Each provider attempt may take 30 seconds.

On a remote tab, `Remote connection unavailable.` appears when the tab has no live connection or its workspace is still being prepared. A connection that drops or stops answering mid-search prints `The remote connection ended.` or `The remote machine did not answer in time.`.

**Providers**

`auto`, the default, walks the providers in order — Tavily, then TinyFish — skipping any without a token and using the first one that has one. When that provider fails, the search falls back to the next configured provider and prints only the eventual results. The search fails only after every configured provider has been tried. An explicit `--provider` uses only that provider and never falls back.

A provider that breaks is disabled for the rest of the server process. An explicit search of a disabled provider prints `Web search failed (<name>): <reason>.` without sending anything, and `auto` skips it. On a local tab one notification, `Web search provider "<name>" disabled: <reason>.`, appears in the notifications tab even when a later provider succeeds, and the search output prints only the provider that answered, so that notification is the only report of the disable when it happens. A remote tab posts no notification and also prints only the answering provider, so a provider disabled before a successful fallback is reported nowhere; a later failure line names it only in an explicit search of it, or in `auto` once every configured provider is disabled.

**Tokens**

Tavily reads its key from `tavily-token` and TinyFish from `tinyfish-token`. Put the file in the project's `.janissary/` or in `~/.janissary/`; the project's file wins. A file holding only whitespace counts as absent. Token files are read once at startup, so a new file takes effect after a restart.

A remote tab uses its workspace's tokens, where a token forwarded from the local machine wins over a file on the remote machine.

**Agent tool**

An `ask` or `tell` agent can run this search when its role grants `web search`; the built-in roles grant it. The agent asks for a search by ending its reply with one lowercase `web search …` line. Only a lowercase line counts, so an answer that begins a sentence with `Web search …` stays prose. A bare `web search` line answers with the usage line. If the granted row is disabled or agent-off, the tool refuses with `Command is disabled: web search.`. Disabling the parent `web` row does the same. An `agent` run refuses every `web` line, so this tool is available only to `ask` and `tell` sessions.

**Use cases**

- Look something up without leaving the tab.
- Gather current results for a question whose answer changes over time.
- Compare what two providers return for the same query.

**Examples**

- `web search node.js permission model 2026` searches with the default provider.
- `web search rust async --results 5 --depth advanced` asks for five deeper results.
- `web search "exact phrase" --provider tinyfish` uses only TinyFish.
