# Web search

`web search` looks something up on the web through a configured provider and prints a Markdown list of results. The typed command searches on the side that owns the tab: the machine running Janissary for a local tab, and the remote machine for a remote tab. The same search and output back the ACP tool; see [[acp]] for how an agent's search is granted and routed.

### Command grammar

`web search <query> [--results <1-20>] [--max-chars <200-100000>] [--depth basic|advanced] [--provider <name>]`

The query is everything after `web search` up to the first whitespace-separated word that starts with `--`, trimmed, with each run of whitespace collapsed to one space. Quotes and operators such as `site:` and `-site:` are kept as typed and sent to the provider, so `"exact phrase"` works. The flags follow the query in any order.

`--results` is the number of results to keep, from 1 to 20, and defaults to 10. A provider may return fewer. `--max-chars` is the character budget for the printed list, from 200 to 100000, and defaults to 10000. `--depth` is `basic` or `advanced`, matched case-insensitively, and defaults to `basic`; `advanced` costs more on Tavily and is ignored by TinyFish. `--provider` names the provider to use, matched case-insensitively, and defaults to `auto`.

The command claims every line that starts with the word `web`, so bare `web` and any other `web <word>` line reach it too. Every malformed form prints exactly `Usage: web search <query> [--results <1-20>] [--max-chars <200-100000>] [--depth basic|advanced] [--provider <name>]` and sends nothing. That covers bare `web`, bare `web search`, an empty query, an unknown or repeated flag, a flag with no value, a `--results` or `--max-chars` that is not a whole number in range, a `--depth` other than `basic` or `advanced`, and a word after the flags that is not a flag's value.

### Completion

The command bar completes `web` to `web search`, the flags not yet used after the query, and the values of `--depth` and `--provider`, but never the query or a numeric value; see [[tab-completion]] for the detail.

### Where a typed search runs

A local tab's search runs on the machine running Janissary, with that machine's tokens. A remote tab's search runs on the remote machine, in that tab's workspace, with that workspace's merged tokens. It never falls back to the local machine. See [[remote-server]] and [[workspaced-agent]] for the remote workspace and connection.

A remote tab with no live connection, or whose workspace is still being prepared, prints `Remote connection unavailable.`. A connection that drops or stops answering mid-search prints `The remote connection ended.` or `The remote machine did not answer in time.`. Anything the remote side answers, results or a failure line, prints unchanged.

A typed search has no cancellation. It runs until it answers or every provider it tries times out.

### Cancellation

An agent search that runs in the same process as its prompt — a local tab's search, or a remote-hosted run's own search — is tied to that prompt's signal. Cancelling the prompt, or aborting the run, aborts the search and tries no further provider. A search the tab forwards to its remote machine has no cancellation on the caller's side; [[acp]] gives the agent cases.

An aborted search rejects with the abort instead of printing a result or a failure line. That covers an abort that lands before any provider is resolved, between two attempts, after a provider has answered, and before the final failure lines would print. An attempt already under way that sees the abort is a cancellation, not a plugin failure: it disables no provider and reports nothing, even when the loaded module has no search function or answered with something other than a list.

The provider API-version check is not a cancellation path. It happens before a module is imported, so a provider written for a different API version disables and reports as the failures section describes, while the search's own signal check runs before each attempt starts.

### Provider selection

Provider names are matched case-insensitively, and `auto` is reserved for auto-selection. `auto`, the default, walks the providers in order — Tavily, then TinyFish — skipping any without a token and using the first one that has one.

An unknown name prints `Web search: unknown provider "<name>" (available: auto, tavily, tinyfish).` and sends nothing. With no provider token at all, `auto` prints `Web search: no provider configured.`. An explicit `--provider <name>` without a token prints `Web search: provider "<name>" is not configured.`. Neither sends anything.

When the first provider of an `auto` search fails, the search falls back to the next configured provider, and prints only its eventual results. A successful search that kept no results is an answer and does not fall back. An explicit `--provider` uses only that provider and never falls back.

### Failures

A provider failure reason is `HTTP <status> <status text>` (just `HTTP <status>` when the text is empty), `timed out after 30 s`, `invalid response`, or the first line of a network error. A provider plugin that breaks reports `provider failed: <first line>`, and one written for a different provider API reports `requires provider API <n>`.

When exactly one provider was tried and failed, the output is `Web search failed (<name>): <reason>.`. When more than one was tried and all failed, it is `Web search: every provider failed.` followed by one `- <name>: <reason>` line per attempt, in order.

### Output

The output is a Markdown list with no header line. Each result is a `- [<title>](<url>)` line, with its snippet on the next line indented two spaces. A result with no snippet prints only its link line. At most `--results` results are printed.

Before printing, every run of whitespace in a title or snippet becomes one space and the ends are trimmed. `[`, `]`, and `\` in a title are backslash-escaped, and spaces and parentheses in a URL are percent-encoded. An empty title is replaced by the URL. A result whose URL is not an absolute `http:` or `https:` URL is dropped and does not count toward the total.

Two results are duplicates when their URLs match after lowercasing the scheme and host, dropping the `#fragment`, and dropping one trailing `/` from the path; query strings are kept. The first, higher-ranked occurrence is kept. Results stay in the provider's own relevance order.

When results do not all fit within `--max-chars`, the list ends with `(showing <k> of <n> results; raise --max-chars for more)`. The budget includes that line. At least one result always appears. If its link line alone is longer than the budget, the link line is printed whole with no snippet. When the link line and the note cannot share the budget, the note is dropped and the link line is printed alone. When they fit, the snippet is cut and ends with `…` when needed; if no snippet room remains only the note follows the link line, and if one character of snippet room remains the snippet is just `…`.

A successful search that kept no results prints `No results for "<query>".`, with the query as sent.

### Tokens

Tavily reads its key from `.janissary/tavily-token` and TinyFish from `.janissary/tinyfish-token`. For each, the project's own file is read first and `~/.janissary/` second. A file holding only whitespace counts as absent. A token file added while Janissary runs takes effect after a restart, because tokens are read once at startup. The search runs in the Janissary process, which reads the key itself, so the key never enters a spawned shell, harness, or ACP agent's environment.

On a remote tab, the search uses the workspace's merged tokens: a token forwarded from the local machine wins over the remote machine's own file, which is the fallback.

### Disabled providers

A provider that breaks is disabled for the rest of the server process. `auto` skips it, and an explicit `--provider` naming it prints `Web search failed (<name>): <reason>.` without sending anything. When every configured provider is disabled, `auto` prints those failure lines without trying any. A disabled provider stays disabled until the server restarts; there is no command that re-enables it.

When a local search disables a provider, one notification, `Web search provider "<name>" disabled: <reason>.`, appears in the notifications tab, attributed to the tab the search ran in (see [[notifications]]), even when a later provider succeeds. It is not added to the tab's transcript, and the search output prints only the provider that answered, so the notification is the only report of the disable when it happens. A remote search posts no notification, because the provider is disabled in the far-side process, and its output also prints only the provider that answered, so a provider disabled before a successful fallback is reported nowhere. A later failure line names a disabled provider only when an explicit search names it, or when `auto` finds every configured provider already disabled.

### Agent tool

An ACP `ask` or `tell` session can run the same search as a callable tool when its role grants the native command `web search`; the built-in `ask` and `tell` roles grant it by default, and a saved roles file is not migrated, so a saved role keeps the grants it lists. With no provider token configured, a granted search reports `Web search: no provider configured.` and sends nothing. The grammar is the typed command's, with the query followed by the optional `--results`, `--max-chars`, `--depth`, and `--provider` flags, and the output is the same Markdown list or failure line the typed search prints. [[acp]] states the exact primer an agent is given and the gate's refusal messages.

The agent asks for a search by ending its reply with one `web search …` line. Only a lowercase `web search` line counts, so a final answer that begins a sentence with `Web search …` stays the answer rather than starting a search. A bare `web search` line is a command and answers with the usage line.

A search runs only when the role grants `web search` and the command's settings allow the agent to use it. A role that does not grant it receives no web tool, so a `web search` line stays prose. With the grant in place, a disabled or agent-off `web search` row refuses with `Command is disabled: web search.`, and disabling the parent `web` row also disables the agent's search. A granted search runs on the side that owns the tab, not on the host running the ACP loop: a local tab searches on the machine running Janissary, with that machine's tokens, and a remote tab searches on that tab's remote host, in that workspace, with that workspace's merged tokens. That includes a local-fallback ACP session on a remote tab, whose search still goes to the remote host and prints `Remote connection unavailable.` when the tab has no ready channel. A remote-hosted loop searches on the far side with that workspace's merged tokens. An `agent` run refuses every `web` line, so this tool is available only to `ask` and `tell` sessions, and a session uses only this command: the harness's own web search stays denied.
