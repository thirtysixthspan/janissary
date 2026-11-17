# Web fetch 24 — `web fetch` in the native vocabulary, grants, and ACP tool table

**Complexity: 6/10** — 15 requirements and 31 test scenarios (mostly vocabulary pins and gate cases) on only ~14 added lines across 3 edited files (p=6.01)

Run order: 24 of 25 in the web fetch series. Source plan: `product/plans/complete/web-fetch.md` (the "Command claim and settings", "How an agent calls it", "Default grants", and "Agent runs" decisions, the vocabulary, grants, and tool-table bullets of "Wiring into existing registries", the ACP half of step 6 of "Order of work", the wiring and vocabulary-pin bullets of "Tests", and the agent-facing parts of "Documentation"). Depends on:

- `product/plans/ready/web-fetch-1-rename-web-directory.md`, for the `src/web/` layout: `isWebCommandLine` in `src/web/command-line.ts`, and `WEB_SEARCH_PRIMER` and `isWebSearchReplyLine` in `src/web/search/command.ts`;
- `product/plans/ready/web-fetch-20-web-entry-point.md`, which makes `runWorkspace` in `src/acp/run-prompt.ts` call `runWebInTab(managers, label, command, request.abort.signal)` for every `web` line, and repoints the `run-prompt.test.ts` mock to `runWebInTab`;
- `product/plans/ready/web-fetch-21-fetch-tab-adapter.md`, which routes `web fetch` through `runWebInTab` to `fetchWebInTab` and creates `product/specs/web-fetch.md` with an empty `### Agent tool` heading;
- `product/plans/ready/web-fetch-22-fetch-completion.md`, whose `web fetch` completion branch this plan's completion test exercises through a real row;
- `product/plans/ready/web-fetch-23-fetch-primer-and-reply-line.md`, for `WEB_FETCH_PRIMER` and `isWebFetchReplyLine` in `src/web/fetch/command.ts`.

Subplan 25 depends on this plan and should land directly after it (see "Remote-hosted loops until subplan 25" below).

An `ask` or `tell` agent reads a page the same way it searches. It ends its reply with one `web fetch <url> [flags]` line. A role grants the native command `web fetch`, and a primer teaches it. This plan adds `web fetch` to the native vocabulary and the built-in grants, builds the `web` tool's primer per grant from subplan 23's primer, and recognises both web reply lines. After subplans 20 and 21, the local ACP run path already sends every `web` line through `runWebInTab`, so no run-path code changes here. Subplan 25 covers the far-side loop.

Paths below are post-subplan-1. At today's baseline the tool table imports `isWebCommandLine`, `isWebSearchReplyLine`, and `WEB_SEARCH_PRIMER` from `src/web-search/command.ts` (`src/acp/tool-table.ts:13`), and `src/web/fetch/command.ts` doesn't exist until subplan 13. Grep for the quoted identifier rather than trusting a line number.

## Design decisions

- **Vocabulary (source plan, How an agent calls it).** `NATIVE_ACP_COMMANDS` in `src/plugins/roles/shared.ts` gains `'web fetch'` on its own line right after `'web search'` (today `:19`), making it the last of 17 entries. That one entry does all of the following, with no change to `src/acp/native-commands.ts`, `src/application-commands.ts`, `src/plugins/roles/command-policy.ts`, `src/plugins/roles/activate.ts`, `src/acp/drive-loop.ts`, or `src/acp/run-prompt.ts`, each of which reads the constant:
  - `listApplicationCommands` builds a native `web fetch` row through the `NATIVE_ACP_COMMANDS` loop in `src/application-commands.ts` (`:73`, `for (const name of NATIVE_ACP_COMMANDS) {`): name `web fetch`, forms `['web fetch']`, no aliases, parent `web`, `nativeTool: 'web'`, with its own Enabled and Agent access settings. The inventory is sorted by name, so the Commands tab lists `web fetch` before `web search`.
  - `nativeCommandName` recognises `web fetch …` case-insensitively, and `nativeCommandTool` maps it to `'web'` through its existing branch (`src/acp/native-commands.ts:18`, `if (native.startsWith('web ')) return 'web';`).
  - The roles payload's `nativeCommands` (`src/plugins/roles/activate.ts:82`) carries it, so the Roles tab offers it in the Add command picker, in vocabulary order after `web search`, and `commandRestrictionsFrom` (`src/plugins/roles/command-policy.ts`) marks it `Disabled application-wide` or `Disabled for agents` from its row.
  - `coreSnapshot` in `src/acp/run-prompt.ts` (`NATIVE_ACP_COMMANDS.map((name) => {`) gives every prompt a `web fetch` settings row, and `corePrimer` in `src/acp/drive-loop.ts` lists it in the allow-list line when granted with agent access.
  `ROLES_PAYLOAD_SCHEMA_VERSION` stays at 4, as it did when `file grep` joined (`product/plans/complete/file-grep.md`) and when `file patch` joined (`src/plugins/roles/shared.ts:1` is still `4` after that change).
- **Typed settings (source plan, Command claim and settings).** With the row present, `resolveApplicationCommand` resolves a typed `web fetch …` line, in any case, to the `web fetch` row instead of the builtin `web` row (the longest matching form wins in `rankCommandRows`, `src/shared/command-matching.ts`). `web fetcher x` still resolves to `web`, because `atFormBoundary` needs a space or the end after the form. `disabledApplicationCommand` (`src/native-commands/policy.ts`) then answers from the `web fetch` row's effective setting, which is off when either the row or its `web` parent is off. So:
  - disabling `web fetch` refuses a typed `web fetch …` with `Command is disabled: web fetch.` (`disabledCommandMessage` in `src/native-commands/dispatch-policy.ts`), and `web search` still runs;
  - disabling `web` refuses a typed `web fetch …` with `Command is disabled: web fetch.` and a typed `web search …` with `Command is disabled: web search.`, as `src/native-commands/policy.test.ts` already pins for search, and bare `web` with `Command is disabled: web.`.
  This replaces the interim rule subplan 21 wrote, where a typed `web fetch` resolved to the `web` row and was refused with `Command is disabled: web.`. No settings code changes. `completeWebCommand` (subplan 22) already gates fetch completion on `policy.allows('web fetch')`, so a disabled `web fetch` row now hides `fetch` and its flags with no completion change.
- **Default grants (source plan, Default grants).** In `src/plugins/roles/roles-file.ts`, the built-in `ask` and `tell` `commands` arrays add `'web fetch'` right after `'web search'`, appended to the same source line (today `:71` and `:85`), so the file's 189 counted lines don't change against the 200-line `max-lines` limit. The repo has no `max-len` rule, and the longer line stays under 110 characters. Today ask grants 10 commands and tell grants 16 (`file patch` landed upstream in tell only). After this plan ask grants 11 and tell grants 17. Tell then still equals the whole vocabulary in order, which `src/plugins/roles/roles-file.test.ts` (`expect(file['tell'].commands).toEqual([...NATIVE_ACP_COMMANDS]);`) pins, so the two arrays must put `web fetch` in the same position.
- **Saved roles (source plan, Default grants and How an agent calls it).** Saved roles files are not migrated and keep the grants they list. A saved role without `web fetch` gets no fetch primer and no `web fetch` in its allow-list line. What happens to a `web fetch` line in its reply follows from the reply-line rule below. When the role grants `web search`, as every saved `ask` and `tell` role made before this change does, the `web` tool is included, so the line is extracted and refused with `Command not allowed for role "<role>": web fetch.`, as one tool step. When the role grants neither web command, there is no `web` tool, so the line stays prose. The source plan's "a `web fetch` line in its reply stays prose" holds only in that second case. The explicit both-reply-lines rule decides the first.
- **Primer per grant.** The `web` entry in `createAcpToolTable` (`src/acp/tool-table.ts`, today `primer: WEB_SEARCH_PRIMER,`) takes its primer from a new private `webPrimer(allowed: readonly string[]): string`, placed directly after `filePrimer` and written the same way: `WEB_SEARCH_PRIMER` when `allowed` includes `web search`, then `WEB_FETCH_PRIMER` when it includes `web fetch`, joined with `'\n\n'`. So a search-only grant gets exactly `WEB_SEARCH_PRIMER`, which keeps every existing search pin true, a fetch-only grant gets exactly `WEB_FETCH_PRIMER`, and both get the two in that order with one blank line between them. `allowed` is the role's grants filtered to the vocabulary, as `filePrimer` receives it, not the agent-access-filtered allow-list. So a granted `web fetch` whose row is agent-off keeps its primer text, as a granted agent-off file command keeps its own (`'keeps the group primer and extraction for a granted owner whose only command is not allowed'`). The tool is included when either command is granted, through the existing `nativeCommandTool(command) === owner` filter, so `webPrimer` never returns an empty string in use.
- **Reply lines (source plan, How an agent calls it).** The `web` entry's `isCommandLine` (today `(line) => isWebSearchReplyLine(line)`) becomes `isWebSearchReplyLine(line) || isWebFetchReplyLine(line)`, whichever subset is granted, as the `file` entry accepts every file grammar. `toolExtractor` already requires `nativeCommandName(line) !== undefined`, which now holds for `web fetch …`. So:
  - a lowercase `web fetch …` line, or bare `web fetch`, is extracted when the role grants either web command. Bare `web fetch` is then answered with `WEB_FETCH_USAGE` by `fetchWebInTab`;
  - a line for the ungranted one reaches `gateCoreCommand`, which refuses it with `Command not allowed for role "<role>": web fetch.` (or `web search`) when its row is enabled with agent access;
  - a `Web fetch …` sentence, `WEB FETCH …`, or `web fetcher` in a final answer is not a command, because `isWebFetchReplyLine` has no `i` flag and needs whitespace or the end after `fetch`.
  `match` stays `(command) => isWebCommandLine(command)`, which already claims `web fetch`.
- **Gate order (unchanged code).** `gateCoreCommand` checks the snapshot row before the grant: a `web fetch` row that is disabled or agent-off, directly or through its `web` parent, refuses with `Command is disabled: web fetch.` and `refused: 'disabled'`, even when the role didn't grant `web fetch`. A granted, enabled `web fetch` returns `{ runsOn: 'workspace' }`.
- **Agent runs (source plan, Agent runs).** `gateAgentCommand` in `src/acp/tool-table.ts` (`|| isFileGrepCommandLine(input) || isWebCommandLine(input)) {`) and `runGrantedAgentCommand` in `src/agent/command-tools.ts` (`:29`, the same condition) already refuse every `web` line with `Agent: command not permitted: <command>.`, granted or not. They stay unchanged, and tests pin `web fetch` there, including a leading `/` and uppercase.
- **Where a local agent fetch runs (source plan, Where a fetch runs, and Remote connection lines and cancellation).** A granted `web fetch` is a workspace step. `runWorkspace` in `src/acp/run-prompt.ts` sends it to `runWebInTab` with the prompt's abort signal (subplan 20), which dispatches to `fetchWebInTab` (subplan 21). So:
  - a local tab fetches on the machine running Janissary with that machine's tokens and posts the `Web provider "<name>" disabled: <reason>.` notification;
  - cancelling the prompt aborts the in-flight attempt and tries no further one. `webFetch` rejects with the abort instead of printing, the loop drops that late rejection (`settleUnlessAborted` in `src/acp/drive-loop.ts`), and an attempt that sees the abort disables no provider (subplans 6 and 15);
  - a local-fallback ACP session on a remote tab goes through `fetchWebInTab`'s remote branch, so it fetches on the remote host with that workspace's merged tokens, prints `Remote connection unavailable.` when the tab has no ready channel, and has no cancel message, so only its late result is suppressed.
  None of this is new code. This plan pins the fetch path in `run-prompt.test.ts` and `drive-loop.test.ts`.
- **Remote-hosted loops until subplan 25.** The far-side loop builds its tool table from the same `createAcpToolTable`, so after this plan a remote-hosted session granted `web fetch` gets the fetch primer and its `web fetch` lines are extracted. But `searchWorkspaceCommand` in `src/remote/serve-acp-loop.ts` still parses every `web` line with `parseWebSearch`, so such a step answers with the `web search` usage line until subplan 25 lands. This plan doesn't touch the far side and doesn't document that interim answer. Land subplan 25 next.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Role here |
| --- | --- | --- |
| Native vocabulary | `NATIVE_ACP_COMMANDS` in `src/plugins/roles/shared.ts` | Gains `web fetch` |
| Native rows | the `NATIVE_ACP_COMMANDS` loop in `buildApplicationCommands`, `src/application-commands.ts:73` | Builds the `web fetch` row, unchanged |
| Native name and tool | `nativeCommandName`, `nativeCommandTool` in `src/acp/native-commands.ts` | Recognise and map `web fetch`, unchanged |
| Typed refusal | `resolveApplicationCommand` in `src/application-commands.ts`; `disabledApplicationCommand` in `src/native-commands/policy.ts`; `disabledCommandMessage` in `src/native-commands/dispatch-policy.ts` | Resolve and refuse a typed `web fetch`, unchanged |
| Built-in grants | `ask` and `tell` in `DEFAULT_ROLES`, `src/plugins/roles/roles-file.ts` | Gain `web fetch` |
| Per-grant primer | `filePrimer` in `src/acp/tool-table.ts` | Model for `webPrimer` |
| Primers and predicates | `WEB_SEARCH_PRIMER`, `isWebSearchReplyLine` in `src/web/search/command.ts` (subplan 1); `WEB_FETCH_PRIMER`, `isWebFetchReplyLine` in `src/web/fetch/command.ts` (subplan 23) | Composed into the `web` entry |
| Gates | `gateCoreCommand`, `gateAgentCommand` in `src/acp/tool-table.ts`; `runGrantedAgentCommand` in `src/agent/command-tools.ts` | Unchanged |
| Workspace dispatch | `runWorkspace` in `src/acp/run-prompt.ts` calling `runWebInTab` (subplan 20), which calls `fetchWebInTab` (subplan 21) | Runs a granted agent fetch, unchanged |
| Test patterns | the `web search` cases in `src/acp/tool-table.test.ts` (`'builds one workspace web tool from a web search grant'`, `'refuses an ungranted web search by role'`, `'refuses agent web lines when %s'`), `src/acp/run-prompt.test.ts` (`'runs a granted web search through the tab search with the prompt signal'`), `src/acp/drive-loop.test.ts` (`'routes a web search to runWorkspace and reports it as a workspace step'`), `src/native-commands/policy.test.ts` (`describe('web search rows')`) | Shape of each new `web fetch` case |

## Proposed changes

Land these, with every test edit below, as one change: the vocabulary pins in `native-commands.test.ts`, `RolesTab.test.tsx`, `ask-role.test.ts`, and `roles-file.test.ts`, and the full-grant primer pin in `tool-table.test.ts`, fail until all three source files move together.

- `src/plugins/roles/shared.ts`: add `'web fetch'` after `'web search'` in `NATIVE_ACP_COMMANDS`.
- `src/plugins/roles/roles-file.ts`: add `'web fetch'` after `'web search'` in the built-in `ask` and `tell` command lists.
- `src/acp/tool-table.ts`: import `isWebFetchReplyLine` and `WEB_FETCH_PRIMER` from `../web/fetch/command.js`; add `webPrimer`; the `web` entry uses `webPrimer(allowed)` and accepts both reply-line predicates. The file is 131 counted lines today and gains about eight. The new import keeps the table plain data: `src/web/fetch/command.ts` imports only `../../positive-integer.js`, `../flag-scan.js`, and a type from `../providers/contract.js` (subplan 13), so no managers load and there's no cycle.

## Tests

- `src/acp/tool-table.test.ts`. Import `WEB_FETCH_PRIMER` from `../web/fetch/command.js`, unmocked, beside the `WEB_SEARCH_PRIMER` import. Update three existing cases:
  - `'keeps the existing table order and appends the canonical allow-list'`: the web element becomes `` `${WEB_SEARCH_PRIMER}\n\n${WEB_FETCH_PRIMER}` ``;
  - `'omits the web tool and its primer unless web search is granted'` becomes "unless a web command is granted": filter out both `web search` and `web fetch`, and assert no tool's primer contains either primer's first line;
  - `'keeps the database entry last when it is included'`: find the web tool by its combined primer rather than `tool.primer === WEB_SEARCH_PRIMER`, which no longer matches under the full grant.
  Add cases:
  - `['web fetch']` builds one workspace tool whose primer is exactly `WEB_FETCH_PRIMER`, and `toolPrimer` gives `` `${WEB_FETCH_PRIMER}\n\nOnly these commands are allowed: web fetch.` ``;
  - `['web search', 'web fetch']`, and the same two in reverse order, give one tool whose primer is search, one blank line, then fetch;
  - with only `web search` granted, `toolExtractor` returns `web fetch https://example.com` and bare `web fetch` from a reply's last line; with only `web fetch` granted, it returns `web search x`;
  - with only `web fetch` granted, `Web fetch returned the page.`, `WEB FETCH https://x`, and `web fetcher x` extract nothing, and `web fetch https://x\nWeb fetch returned the page.` returns the earlier line;
  - with only `file read` granted, `web fetch https://x` extracts nothing;
  - `gateCommand` with grants `['web fetch']` routes `web fetch https://x` to `{ runsOn: 'workspace' }`;
  - with grants `['web search']`, an enabled `web fetch` is refused with exactly `{ refusal: 'Command not allowed for role "writer": web fetch.' }` (the existing `coreSnapshot` helper's role name), and with grants `['web fetch']` a `web search` line is refused the same way with `web search`;
  - a `web fetch` row that is disabled, and one that is agent-off, refuse with `{ refusal: 'Command is disabled: web fetch.', refused: 'disabled' }`, whether or not the role grants it;
  - `'refuses agent web lines when %s'` adds `web fetch https://x`, `WEB FETCH x`, and `/web fetch https://x` to its command list.
- `src/agent/command-tools.test.ts`: `'refuses web lines with or without the web grant, before dispatch'` adds `web fetch https://x` and `/web fetch https://x`, still with no dispatch.
- `src/acp/run-prompt.test.ts`, beside the `web search` cases (which use `mocks.runWebInTab` after subplan 20):
  - a role granting only `web fetch` runs `deps.runCommand('web fetch https://x')` through `mocks.runWebInTab(managers, 'shell', 'web fetch https://x', request.abort.signal)`, its primer contains `WEB_FETCH_PRIMER` and `Only these commands are allowed: web fetch.` and not `WEB_SEARCH_PRIMER`;
  - with only `file read` granted, `deps.extractCommand('web fetch https://x')` is null;
  - a disabled `web fetch` setting refuses `web fetch https://x` synchronously with `Command is disabled: web fetch.` and never calls `runWebInTab`.
- `src/acp/drive-loop.test.ts`: a `web fetch https://x` step with grants `['web fetch']` goes to `host.runWorkspace` once, never to `runCaller`, and is reported as a workspace step.
- `src/plugins/roles/roles-file.test.ts`: the expected `ask` and `tell` arrays gain `web fetch` after `web search`, the lengths become 11 and 17, and the existing `toEqual([...NATIVE_ACP_COMMANDS])` for tell passes unchanged. In the saved-roles case (`expect(read.roles[0]?.commands).not.toContain('web search');`), add the same two assertions for `web fetch`.
- `src/acp/ask-role.test.ts`: `ASK_COMMANDS` gains `web fetch` after `web search`; tell's `toHaveLength(16)` becomes 17 and its `arrayContaining` list gains `web fetch`.
- `src/application-commands.test.ts`: the `web fetch` row equals `{ name: 'web fetch', kind: 'native', aliases: [], forms: ['web fetch'], parent: 'web', nativeTool: 'web' }`; `resolveApplicationCommand('web fetch https://example.com')` and `'WEB FETCH x'` resolve to it; `web fetcher x` resolves to the builtin `web` row. `src/application-commands.claims.test.ts` loops over the vocabulary and needs no edit.
- `src/native-commands/policy.test.ts`, in `describe('web search rows')` renamed `describe('web rows')`: disabling `web fetch` refuses `web fetch https://x` by the `web fetch` row and leaves `web search x` and `web` alone; disabling `web` makes `web fetch` effectively disabled and refuses `web fetch https://x` by the `web fetch` row.
- `src/completion/web.test.ts`: with `policyWith({ 'web fetch': { enabled: false } })`, `web ` offers `['search']` and `web fetch https://x -` is unchanged with no matches. This is the real-row counterpart of subplan 22's hand-built-policy case.
- `src/acp/native-commands.test.ts`: the ordered vocabulary gains `'web fetch'` last; the `it.each` table gains `['web fetch https://example.com', 'web']` and `['WEB FETCH x', 'web']`; the rejects case adds `nativeCommandName('web fetcher x')` as undefined.
- `web/src/plugins/roles/RolesTab.test.tsx`: `expect(NATIVE_ACP_COMMANDS).toHaveLength(16)` becomes 17, beside a new `toContain('web fetch')`.

## Out of scope

- The far-side ACP loop and its spec sentences (subplan 25).
- Migrating saved roles files.
- Fetching from `agent` runs, which stay refused.
- The typed command, its adapter, its completion, and the primer and predicate themselves (subplans 21 to 23).

## Documentation

Each doc describes what is true once this plan lands, for local and local-fallback sessions. None names a subplan. The far-side sentences wait for subplan 25.

- `product/specs/web-fetch.md` (created by subplan 21):
  - **Settings.** Replace the interim sentence with this. A typed `web fetch` resolves to its native `web fetch` row, which has the parent `web` and its own Enabled and Agent access settings ([[application-commands]]). Disabling `web fetch` refuses the typed command and the agent tool with `Command is disabled: web fetch.`. Disabling `web` refuses it with the same line, and refuses `web search` too.
  - **Agent tool.** Fill the `### Agent tool` section in this order:
    - the grant: native command `web fetch`, granted by the built-in `ask` and `tell` roles, with saved roles not migrated;
    - the tool-field mapping (`url` is the URL, `format` is `--format`, `timeout` is `--timeout`, `maxChars` is `--max-chars`, `provider` is `--provider`), with no function-calling tool, MCP server, or JSON form;
    - the primer, verbatim, as subplan 23 fixes it, following the search primer after one blank line when both are granted. It has no year guidance, because a fetch takes a URL and infers no freshness;
    - the reply line: only a lowercase `web fetch` line counts, a bare one answers with the usage line, a `Web fetch …` sentence stays the answer, and either web grant makes both reply lines recognised;
    - the saved-role outcomes from "Saved roles" above;
    - the gate's two refusals verbatim, the disabled one first;
    - `agent` runs refusing `janissary web fetch …` with `Agent: command not permitted: <command>.`;
    - where a local agent fetch runs and how cancellation behaves, per "Where a local agent fetch runs" above;
    - that the harness's own web tools stay denied.
    Name `createAcpToolTable` and `gateCommand` in `src/acp/tool-table.ts`, cross-reference [[acp]] and [[roles]], and leave the remote-hosted loop to subplan 25.
- `product/specs/acp.md`:
  - The tool-table paragraph (`The web owner covers \`web search\`, and is included when the role grants it.`): the web owner covers `web search` and `web fetch`, and is included when a role grants either.
  - The workspace-routing sentence (`A \`web\` line likewise goes to the same search as the typed command on the side that owns the tab: locally through the tab, …`): its local half and the following cancellation sentence cover a search or a fetch. Leave the `on the far side …` clause naming search only.
  - The grant counts (`ask grants ten commands, including \`file glob\`, \`file grep\`, and \`web search\`, and tell grants sixteen, every native command, …`): ask grants eleven, tell grants seventeen, and both lists add `web fetch`.
  - The untagged typed outputs list (`… \`file grep\`, \`web search\`, \`file write\` …`) adds `web fetch`.
  - The token sentence (`Neither is either search key: \`web search\` runs in the Janissary process that owns the tab`) names both web commands.
  - `### Web search`: its two sentences that tie the web tool to the `web search` grant alone (`The web tool is included exactly when the role grants \`web search\`; …` and `A role that does not grant \`web search\` receives no web tool at all, …`) change to "a role granting neither web command gets no web tool; a role granting only `web fetch` has the tool, so a `web search` line is extracted and refused by role".
  - A new `### Web fetch` subsection follows `### Web search`. It covers the grant, the primer verbatim in a fenced block, the composition order, the lowercase reply line, the gate, workspace routing, and cancellation.
- `product/specs/web-search.md`, `### Agent tool` (`A role that does not grant it receives no web tool, so a \`web search\` line stays prose.`): the same correction as `acp.md`, and the web tool is included when the role grants either web command.
- `product/specs/agent-command.md`: in both run paragraphs, `` `janissary web …` lines, including `janissary web search …` `` becomes "including `janissary web search …` and `janissary web fetch …`".
- `product/specs/roles.md`: the ask list (`` `file read`, `file glob`, `file grep`, and `web search`. ``) adds `web fetch`; `The \`tell\` role grants all sixteen native commands: those ten plus …` becomes seventeen and eleven; `hidden when all sixteen native commands are present` becomes seventeen.
- `product/specs/application-commands.md`: after the `web search` paragraph, add the matching `web fetch` paragraph, with `web fetch` resolving to its native row like a typed `file write`. `disabling \`web\` disables both` names both subcommands.
- `help/commands.md`, the native-rows paragraph below the table (`… and a row for \`web search\` under the parentless \`web\`.`): rows for `web search` and `web fetch`.
- `help/web.md`: a `**Fetch agent tool**` section between subplan 21's `**Where a fetch runs**` and `**Fetch examples**`. It mirrors the search `**Agent tool**` paragraph for `web fetch`: the grant, the lowercase reply line, the bare line, the two refusals, local-tab cancellation, and `agent` runs. It adds that a role granting either web command has both reply lines recognised, so the other one is refused by role rather than kept as prose.
- `help/ask.md` and `help/tell.md`: the default grant lists add reading a web page with `web fetch`, and tell's `all sixteen native commands` becomes seventeen, ending `web search and web fetch`. The `Its web search is the granted \`web search\` command, which needs a provider token.` line gains that it reads a page with the granted `web fetch` command, which needs no token because it falls back to a direct fetch.
- `help/roles.md`: the default `ask` grants sentence adds reading a web page.
- `documentation/user-documentation/advanced-agents/acp-agent.md`:
  - the default-grants sentence adds reading a web page;
  - the agent-tools paragraph and the `To search the web…` paragraph gain the fetch equivalents;
  - the remote paragraph (`A granted \`web search\` follows the tab …`) covers a fetch too;
  - the untagged typed list adds `web fetch`.
- `documentation/user-documentation/advanced-agents/agent-command.md` (`` and `web` (including `web search`) ``): add `web fetch`.
- `documentation/user-documentation/tab-types/roles.md`: ask's default commands add reading a web page, and `When all sixteen native commands are granted` becomes seventeen.
- `documentation/user-documentation/tab-types/commands.md` (`` `web` has its own row with no parent, and `web search` is a native child … ``): `web search` and `web fetch` are both native children with their own boxes. Turning off `web` refuses both, and turning off either refuses only that command, typed or as an agent tool.

No file paths or function names go in `help/` or `documentation/user-documentation/`, per `ai/guidelines/user-documentation.md`.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then run `npm run test:server -- src/acp src/agent src/plugins/roles src/application-commands src/native-commands src/completion` and `npm run test:client -- web/src/plugins/roles`, so every vocabulary pin runs even where `--changed` would skip it. Confirm `git grep -n "sixteen native\|grants ten" -- product help documentation` finds nothing.

Then, on a local tab:

1. Ask an `ask` session a question that needs a known page's content. Confirm the agent emits a `web fetch` line, the connection record shows it as a workspace step, and the answer uses the page.
2. In the Roles tab, remove `web fetch` from `ask`, keep `web search`, and ask again for a page. Confirm a `web fetch` step answers `Command not allowed for role "ask": web fetch.`. Restore the grant.
3. In the Commands tab, disable `web fetch`. Confirm a typed `web fetch https://example.com` prints `Command is disabled: web fetch.` while `web search x` still runs, and `web ` offers only `search`. Re-enable it, disable `web`, confirm `web fetch https://example.com` prints `Command is disabled: web fetch.`, then re-enable `web`.
