# features

## ready

* Assistant: The web fetch feature is a minimal, mode-flexible URL-fetching capability surfaced in Janissary as the command web fetch <url> [--format markdown|text|html] [--mode local|remote] [--timeout s] [--prompt p] [--max-chars n] [--provider name] and registered to ACP ask and tell sessions as a web_fetch tool whose JSON schema exposes a required url string plus optional format ("markdown"|"text"|"html", default "markdown"), mode ("local"|"remote", default "local"), timeout (int, default 30, max 120), prompt (extraction instruction), maxChars (int, default 10000), and provider (default auto-selected), and it shares the plugin framework and core pipeline — registry, domain filtering, dedup, and truncation — with the existing web search feature so that a single provider plugin supplies both capabilities. The core is described by web_fetch(url, format="markdown", mode="local", timeout=30, prompt=null, maxChars=10000, provider="auto") -> text: in local mode a built-in node-fetch transport makes the direct HTTP(S) connection from the Janissary machine (auto-upgrading HTTP to HTTPS and converting the body to Markdown locally), which means it can reach localhost/LAN hosts and honors the host's firewall, VPN, and proxy rules but leaks the machine's IP and cannot solve bot challenges; in remote mode the request is delegated to a provider's server-side fetch endpoint — Tavily's extract and TinyFish's api.fetch.tinyfish.ai (full-browser rendering returning clean Markdown/JSON/HTML) — which brings provider-side browser/proxy machinery to bear on JS-heavy pages and, to a non-guaranteed degree, bot detection, at the cost of being blind to the operator's private network. Providers are plugins exposing a superset of the search contract, { name, search(params) -> {title,url,snippet}[], fetch(params) -> {url,format,content} }, with Tavily and tinyfish bundled and additional backends addable by registration without core changes; the core normalizes every provider's response shape into a single FetchResult, applying any configured domain filtering, then returns a single plain-text string — the page content as Markdown (or text/html), optionally narrowed by prompt, truncated to max-chars, with oversized pages summarized rather than returned verbatim. The operation is read-only, single-call, and atomic, taking a fully-formed valid URL and never writing files or following multi-step navigation; for time-sensitive retrieval the current year is treated as 2026 so callers include it in query context rather than relying on the tool to infer freshness. A faithful minimal replication therefore needs only web_fetch(url, format, mode, timeout, prompt, maxChars, provider) -> text, where mode selects between local node-fetch and remote provider-API fetching, and the same core serves both the web fetch ... command and the ACP tool, with Tavily and tinyfish available behind the shared plugin fetch() interface.

A new subagent command may be invoked as 
`subagent --role <type> --task <file.md> [--model <provider/model>] [--context <text>]

where 
--role selects the subagent's role
--task names an existing AI markdown file whose contents run as the subagent's instructions
--context provides additional parameters and context for executing the task

The input may be provided as JSON: 
{
 "role": string, 
 "task": string, 
 "context": text, 
 "model": string, 
}
and the command immediately returns an output object 
{
"status": "started", 
"sessionId": uuid, 
"role": string, 
"parentId": uuid, 
"depth": integer
} 
All subagents run in the background. The subagent runs in a fresh workspace with only the commands allowed for the role, When it finishes, the parent receives a completion message in 
a normalized format: 
{
"status": string, 
"output": text
}
the output being a distilled result rather than raw intermediate steps. 
status takes on the following values:
"started"	Returned immediately on launch; subagent is running in the background
"completed"	Subagent finished successfully
"partial"	Output stopped by a turn limit before finishing

To deliver an async result from a subagent, you'd emit session/update notifications keyed to that child's sessionId, and the client correlates them via the sessionId/parentId from the child session's metadata.

## development


* add an ACP skill to allow an agent to spin up other agents with different models, pass them ai tasks (form the repository) to execute and access to monitor the transcript as the agent works, and to recieve the response.



## deferred

* Bundle janissary as a mac application that can be dowloaded and installed into /Applications and launched from an icon in the toolbar.

* Durable flows across relaunch - capture exit information from a harness and be able to use it to restart a session. a relaunch harness picker. workspace dir would need saved and re-created.

## declined

