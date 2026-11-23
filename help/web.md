### web

Search the web through a configured provider and print the results as a Markdown list, or fetch one page by its URL and print its contents. A local tab runs on the machine running Janissary. A remote tab runs on the remote machine, in that tab's workspace, and never falls back to the local machine. A typed search or fetch has no cancellation: it runs until it answers or every attempt it tries times out. A search run by an `ask` or `tell` agent is cancelled with its prompt: the in-flight provider request is aborted, no further provider is tried, and its late result is suppressed; a local-fallback session's remote search has no cancel message, so only the late result is suppressed.

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

Bare `web`, and any `web <word>` whose word is neither `search` nor `fetch`, print `Usage: web search <query> [--results <1-20>] [--max-chars <200-100000>] [--depth basic|advanced] [--provider <name>]` followed by `Usage: web fetch <url> [--format markdown|text|html] [--timeout <1-120>] [--max-chars <200-100000>] [--offset <n>] [--provider <name>]`, one per line, and send nothing. Every other malformed `web search` line prints only the `web search` usage line and sends nothing. That covers bare `web search`, an empty query, an unknown or repeated flag, a flag with no value, a `--results` or `--max-chars` outside its range or not a whole number, a `--depth` other than `basic` or `advanced`, and a word after the flags that is not a flag's value.

A search prints one of these lines when it cannot answer:

- `Web search: no provider configured.` when no provider has a token.
- `Web search: provider "<name>" is not configured.` when the named provider has no token.
- `Web search: unknown provider "<name>" (available: auto, tavily, tinyfish).` when the name is not a search provider; `local` fetches only, so `--provider local` prints this line too.
- `Web search failed (<name>): <reason>.` when exactly one provider was tried and failed.
- `Web search: every provider failed.` followed by one `- <name>: <reason>` line per attempt, when more than one provider was tried and all failed.

A reason is `HTTP <status> <status text>`, `timed out after 30 s`, `invalid response`, the first line of a network error, `provider failed: <first line>` when a provider plugin breaks, or `requires provider API <n>` when it expects another provider API version. Each provider attempt may take 30 seconds.

On a remote tab, `Remote connection unavailable.` appears when the tab has no live connection or its workspace is still being prepared. A connection that drops or stops answering mid-search prints `The remote connection ended.` or `The remote machine did not answer in time.`.

**Providers**

`auto`, the default, walks the providers in order — Tavily, then TinyFish — skipping any without a token and using the first one that has one. When that provider fails, the search falls back to the next configured provider and prints only the eventual results. The search fails only after every configured provider has been tried. An explicit `--provider` uses only that provider and never falls back.

A provider that breaks is disabled for the rest of the server process, for both `web search` and `web fetch`: a provider disabled by either command is disabled for both. An explicit search of a disabled provider prints `Web search failed (<name>): <reason>.` without sending anything, and `auto` skips it. On a local tab one notification, `Web provider "<name>" disabled: <reason>.`, appears in the notifications tab even when a later provider succeeds, and the search output prints only the provider that answered, so that notification is the only report of the disable when it happens. A remote tab posts no notification and also prints only the answering provider, so a provider disabled before a successful fallback is reported nowhere; a later failure line names it only in an explicit search of it, or in `auto` once every configured provider is disabled.

**Tokens**

Tavily reads its key from `tavily-token` and TinyFish from `tinyfish-token`. The same files serve `web fetch`; the `local` provider needs no token. Put the file in the project's `.janissary/` or in `~/.janissary/`; the project's file wins. A file holding only whitespace counts as absent. Token files are read once at startup, so a new file takes effect after a restart.

A remote tab uses its workspace's tokens, where a token forwarded from the local machine wins over a file on the remote machine.

**Agent tool**

An `ask` or `tell` agent can run this search when its role grants `web search`; the built-in roles grant it. To search the web, the agent puts exactly one lowercase `web search …` command inside a final fenced block whose info string is exactly `janissary`. Only a lowercase command in that block counts, so an answer that begins a sentence with `Web search …` stays prose. A bare `web search` final line outside the block is prose that ends the turn, not a command; a malformed `web search` command in the block answers with the usage line. Zero or more than one command in the block draws the shared correction instead of ending the turn.

````text
```janissary
web search node.js permission model 2026 --results 5
```
````

If the granted row is disabled or agent-off, the tool refuses with `Command is disabled: web search.`. Disabling the parent `web` row does the same. An `agent` run refuses every `web` line, so this tool is available only to `ask` and `tell` sessions.

**Use cases**

- Look something up without leaving the tab.
- Gather current results for a question whose answer changes over time.
- Compare what two providers return for the same query.
- Read the page a search found.

**Examples**

- `web search node.js permission model 2026` searches with the default provider.
- `web search rust async --results 5 --depth advanced` asks for five deeper results.
- `web search "exact phrase" --provider tinyfish` uses only TinyFish.

**Fetching a page**

`Usage: web fetch <url> [--format markdown|text|html] [--timeout <1-120>] [--max-chars <200-100000>] [--offset <n>] [--provider <name>]`

The URL is exactly one word, an absolute HTTP or HTTPS URL kept as typed, and comes first; the flags follow in any order, each once. Flag names match only in lowercase.

- `--format` is `markdown`, `text`, or `html`, matched without regard to case, and defaults to `markdown`.
- `--timeout` is whole seconds from 1 to 120 and defaults to 30.
- `--max-chars` is 200 to 100000 and defaults to 10000.
- `--offset` is a whole number of 0 or more and defaults to 0.
- `--provider` defaults to `auto`, matched without regard to case.

A leading zero on a non-zero number is accepted, but `--offset 00` is refused. One call takes one URL, returns one result, writes no files, and follows no multi-step navigation.

The output is `Fetched <final url> (<source>).`, one blank line, then the content slice starting at `--offset`. `--max-chars` covers the whole output. When content remains, a last line reads `(showing characters <a>-<b> of <n>; continue with --offset <b>)`; use that offset to read the next slice. Offsets and counts are in UTF-16 code units, a slice never splits a surrogate pair, and at least one unit always prints. Empty content prints the source line, a blank line, and `(empty page)`. An offset at or past the end prints the source line, a blank line, and `(offset <o> is past the end; the page has <n> characters)`. A redirect to another host prints `Web fetch: redirected to <url>.` instead. Long pages are read in slices; nothing is summarized.

**Fetch errors**

Every malformed form prints only `Usage: web fetch <url> [--format markdown|text|html] [--timeout <1-120>] [--max-chars <200-100000>] [--offset <n>] [--provider <name>]` and sends nothing. That covers bare `web fetch`, a missing or non-HTTP(S) URL, a flag before the URL, an unknown flag (`--prompt` and `--mode` included) or a flag in the wrong case, a repeated flag, a flag with no value, a number outside its range or not whole, a `--format` outside its three values, and any extra word, a second URL included.

A fetch prints one of these refusals and sends nothing: `Web fetch: unknown provider "<name>" (available: auto, tavily, tinyfish, local).` with the name as you typed it, `Web fetch: provider "<name>" is not configured.`, `Web fetch: provider "<name>" does not support --format <format>.`, and the stored failure line of a disabled provider.

A failed attempt prints `Web fetch failed (<name>): <reason>.`. When several are tried and all fail, it prints `Web fetch: every attempt failed.` followed by one `- <name>: <reason>` line per attempt, in order; a successful fallback prints only the attempt that answered. A reason is `HTTP <status> <status text>` (just `HTTP <status>` when the text is empty), `timed out after <s> s`, `invalid response`, `too many redirects`, `unsupported content type <type>`, `response larger than 50 MB`, `could not fetch: <provider error>`, the first line of a network error, `provider failed: <first line>`, or `requires provider API <n>`.

**Fetch providers**

Tavily, TinyFish, and `local`, in that order, are the fetch providers; one provider serves both search and fetch. Tavily returns `markdown` and `text`, TinyFish returns `markdown` and `html`, and `local` returns all three raw. `auto`, the default, tries every fetch-capable provider in order, skipping one with no token, one that cannot serve `--format`, and one that is disabled, and falls back from each failed attempt. Because `local` needs no token and serves every format, `auto` always ends at `local` unless it is disabled. An explicit `--provider` tries only that provider and never falls back; `--provider local` is a direct fetch only. `--timeout` applies to each attempt separately, so a chain of three attempts can take three times the timeout. Tavily is sent the smaller of `--timeout` and 60 seconds while you still wait the full `--timeout`.

A provider broken by a fetch or a search is disabled for both commands until the server restarts. `auto` skips a disabled provider, and an explicit one prints its stored failure line. On a local tab one notification, `Web provider "<name>" disabled: <reason>.`, appears in the notifications tab even when a later provider succeeds. A remote tab posts none.

**The local provider**

`local` makes a direct GET from the machine that owns the tab, through that machine's network, firewall, VPN, and proxy. It exposes that machine's IP and cannot solve bot challenges. It can reach any host that machine can reach, public, loopback, LAN, and link-local alike, with no address checks before connecting or on redirects; the role grant is the trust boundary.

The body is returned exactly as received, decoded to text, whatever `--format` says, with no conversion; the `(local)` source tells you it is raw. `text/*` (HTML included), `application/xhtml+xml`, `application/json`, `application/xml`, and any `+json` or `+xml` suffix are returned. Anything else, a missing header included (read as `application/octet-stream`), fails with `unsupported content type <type>`. At most 50 MB is read, streamed and counted in bytes; a larger declared size or body fails with `response larger than 50 MB`.

The body is decoded using the `charset` in `Content-Type`, or UTF-8 when it is absent or unknown, with invalid bytes replaced. A non-2xx final status fails with `HTTP <status> <status text>`, as does a 3xx with no usable `Location`. An `http:` URL becomes `https:` unless its host is `localhost` or a `.localhost` name, an IP literal in `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `::1/128`, `fc00::/7`, or `fe80::/10` (an IPv4-mapped IPv6 literal counts by its IPv4 address), or a single label with no dot. That is decided from the URL alone, with no lookup. Each fetch uses a fresh desktop Chrome profile: `User-Agent`, a quoted `Sec-CH-UA-Platform`, `Accept-Language`, and a browser-style `Accept` preferring HTML, the same on every hop, with no cookies kept.

A same-host redirect, compared without regard to case and with scheme and port free to change, is followed with the upgrade rule applied, for at most 5 hops; a sixth fails with `too many redirects`. A redirect to a different host, or to a non-HTTP(S) URL, is not followed and prints `Web fetch: redirected to <url>.`, which is an answer rather than a failure, so `auto` does not fall back. Tavily and TinyFish handle their own redirects.

**Fetch cache**

A successful fetch's full content, final URL, and source are kept in memory for 15 minutes in the process that ran it, keyed by the URL as typed, `--format`, and `--provider`, but not by `--timeout`, `--offset`, or `--max-chars`. At most 50 entries are kept, the least recently used one evicted; a hit counts as a use without extending its expiry. The content of all entries together is capped at 20,000,000 UTF-16 units: after a page is stored, least recently used entries are evicted until both the count and the character total are within their limits, and replacing a key or reading an expired entry frees the old entry's characters. A page whose content alone exceeds 5,000,000 units (a quarter of the total budget) is never cached: storing it removes any entry under the same key, prints the page normally, and a later `--offset` read fetches it again. `--offset 0` never reads the cache and replaces the entry on success. An offset above 0 slices from a live entry, even one whose provider has since been disabled, and otherwise fetches and stores. Failures, redirected-to lines, and refusals are never stored and leave an existing entry alone; the empty-page answer is stored. A hit prints exactly what a fresh fetch prints, with no marker. There is no bypass flag, and the cache is lost on restart. A remote host keeps its own cache, shared by every workspace it serves.

**Where a fetch runs**

A local tab's fetch runs on the machine running Janissary, with that machine's tokens. A remote tab's fetch runs on the remote host, in that tab's workspace, with that workspace's merged tokens, where a token forwarded from the local machine wins over the remote machine's own file. Its `local` provider sees the remote host's network, and it never falls back to the local machine. A remote tab with no live connection, or whose workspace is still being prepared, prints `Remote connection unavailable.`. A connection that drops or stops answering prints `The remote connection ended.` or `The remote machine did not answer in time.`. Anything the remote side answers prints unchanged. A typed fetch has no cancellation, and neither does a fetch sent to a remote host.

**Fetch agent tool**

An `ask` or `tell` agent can read a page when its role grants `web fetch`; the built-in `ask` and `tell` roles grant it. The agent asks for a fetch by ending its reply with one lowercase `web fetch …` line, and a bare `web fetch` line answers with the usage line. Only a lowercase line counts, so an answer that begins a sentence with `Web fetch …` stays prose, and neither `WEB FETCH …` nor `web fetcher …` is a command. A role granting either web command has both web reply lines recognised, so a role that grants `web search` but not `web fetch` gets the fetch line extracted and refused with `Command not allowed for role "<role>": web fetch.` rather than kept as prose. If the granted `web fetch` row is disabled or agent-off, the tool refuses with `Command is disabled: web fetch.`; disabling the parent `web` row does the same. On a local tab the fetch runs on the machine running Janissary, and cancelling the prompt aborts the in-flight attempt and starts no further one. An `agent` run refuses every `web` line, so this tool is available only to `ask` and `tell` sessions.

**Fetch examples**

- `web fetch https://nodejs.org/api/permissions.html --max-chars 5000` reads a page a search found, with a larger budget.
- `web fetch https://example.com --provider local --format html` fetches the raw body directly.
- `web fetch https://example.com --offset 4200` continues from the offset named in an earlier slice.
