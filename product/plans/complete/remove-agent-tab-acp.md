# Remove ACP support from agent tabs

**Complexity: 7/10** — detach agent dispatch and messaging from ACP while exposing the retained core service to plugin tabs and adding a core streaming response panel.

## Goal

Agent tabs do not start or call their own ACP sessions, through explicit commands or prose recognition. ACP remains a core feature documented in `product/specs/acp.md`. Shell and any other tab plugin may use scoped core operations to start, prompt, and reset a connection without owning a terminal. Monitors, conversations, and editor queries retain their existing ACP transports and behavior.

## Approach

The user selected a core response panel with streamed Markdown, tool steps, and questions; retained executable command requests while removing agent ACP prose routing; preserved current OpenCode/model selection, session reuse/reset, database/browser/question tool loops, local sandboxing and remote workspaces; and selected deletion of the affected mixed backlog entries. Keep the `acp` and `acp reset` wording on supported tabs. Unsupported agent commands follow the ordinary unknown-command path, with no removal warning or compatibility shim.

The user directed proceeding after the reset/question interaction was raised. Reset cancels only the in-flight ACP request's question, including a queued question, and preserves unrelated questions. Add request-scoped cancellation through `src/questions.ts`, `src/question-command.ts`, `src/acp/tool-table.ts`, `src/acp/types.ts`, and `src/acp/loop.ts`, with an abort controller owned by the tab's ACP request. Keep existing question behavior unchanged when no signal is supplied. Extend the plugin documentation test's count-word fixture for the additive capability count while retaining its assertions and the historical API changelog.

Add narrow start/prompt/reset capabilities to the tab-plugin API. Bind them to the caller's own plugin tab and exempt provider latency from plugin handler budgets. Keep protocol sessions, rendering state, transcript projection, tool execution, and teardown in core. The shell opts in and renders the host's response panel; it owns no ACP implementation. Keep one session per tab, serialize prompts through a per-tab in-flight guard, settle calls on reset/close, and ignore callbacks from obsolete sessions. New per-tab response metadata belongs on the tab's runtime record. Reuse the existing transcript and Markdown rendering machinery without duplicating transcript text.

## Implementation steps

1. Add contextual command availability and ACP-aware route filtering in `src/commands/types.ts`, `src/resolve.ts`, `src/command/manager.ts`, `src/capture/manager.ts`, `src/route-choice.ts`, `src/command/router.ts`, and the recognizer modules. Restrict the retained `acp` and `acp-reset` command definitions to opted-in plugin tabs. Remove only tests/assertions for the removed agent ACP commands, prose routing, and message capture from related command/controller/capture/routing tests. Add agent exclusion and retained executable-request regression tests.
2. Generalize core ACP lifecycle under `src/acp/`, extracting cohesive session/model helpers as needed. Add tab-owned ACP entry identity and in-flight request state in `src/tab/types.ts`; track immutable running-entry replacements in `src/tab/transcript/events.ts`; expose a server-flattened ACP response slice through `src/tab/view.ts`, `src/protocol/tab.ts`, and `src/protocol.ts`. Preserve low-level protocol, loop, model, remote, connection catalog, and shared-consumer tests. Add generic plugin start/prompt/reset capabilities in `src/plugins/api.ts`, `api-capabilities.ts`, a focused capability module, and `context.ts`. Update transcript export only where necessary, retaining other scopes. Make core-rendered command replies an explicit command metadata option so shell command dispatch does not duplicate ACP replies in the terminal.
3. Add a core response panel and scoped provider under `web/src/shared/acp/`, using shared transcript rendering. Publish the consumer hook through `web/src/plugins/api.ts`. Compose it in `PluginBody`, `PluginTabLayer`, and `DockedPluginBody`, and render it in the shell. Update the shell declaration and dispatch-result contract/adapter to opt into core ACP and skip duplicate terminal replies. Keep existing shell routing and queue behavior otherwise intact. Extend the existing collapse RPC with an optional tab label for scoped tool-step controls; update its protocol, validation, controller adapter, tab operation, and message handling without changing legacy calls. Add streaming, isolation, reset/close, panel, tool-step, and shell integration tests. Update the route chooser's default selection only as necessary when ACP is absent.
4. Rewrite `product/specs/acp.md` as the authoritative core spec and update affected ACP sections in shell-tab, tab-plugins, command-routing, messaging, connection, tabs, transcript, markdown-rendering, remote-server, workspaced-agent, monitoring, editor-tab, conversations, agent-questions, sandbox, notifications, application-commands, and tab-completion specs as applicable. Update matching user docs for ACP, shell, messaging, connections, remote/workspaced agents, Markdown rendering, monitoring, installation, and activity-log; plugin developer documentation; `help.md`; and affected architecture/plugin guidance. Preserve pages and their navigation/assets where ACP remains. Delete the selected backlog entries for context compaction, session mode/model controls, exposing tools, tab reopening, environment inheritance, and the command palette, plus the agent-ACP interruption entry that loses its purpose. Retain the generic ACP-skill entry and unrelated shared-feature backlog entries. Leave completed plans and historical changelog entries untouched.
5. Remove only new dead-code findings, compare against the baseline, verify remaining features, complete this plan, and open a breaking-change PR for human merge.

## Tests

Run diff-scoped checks after each implementation step. Preserve ACP protocol/tool-loop/model/remote, monitor, conversation, editor, shell, and connection behavior coverage. Delete agent-ACP-only tests. Add meaningful tests for contextual exclusion, executable requests without prose ACP, plugin capability scope and declarations, startup without a terminal, provider latency exemption, busy prompt handling, streamed response projection, local/remote session lifecycle, reset/close settlement, stale callbacks, tool steps, and docked panel ownership. Remaining-feature assertions are retained.

## Spec updates

`acp.md` owns availability, plugin capabilities, model selection, sessions, streaming, tools, errors, transcript export, sandboxing, remote workspaces, and lifecycle. Shell documents command-bar entry points and the core response panel. Other shared consumers keep their own feature specs and reference the common transport as appropriate.

## Verification

Fresh baseline: full typecheck and lint passed; lint has the pre-existing cognitive-complexity warning in `web/src/shared/fuzzy-match.ts`. All 860 test files passed: 12367 tests passed and one pre-existing skipped test.

Complete dead-code baseline:

```text
Unused exports (1)
RemoteChip  web/src/plugins/api.ts:62:10
Unused exported types (1)
TabPluginLaunchReady  type  src/plugins/api.ts:24:27
```

Run `./scripts/run.mjs check-diff`, full typecheck/lint/tests through the PR gate, dead-code comparison, docs build, and the production web build with plugin chunk inspection. If an attached browser and an available authenticated ACP provider make it possible, live-check agent exclusion, executable messaging, shell streaming/tools/questions/reset, remote shell ACP, and docked ownership in a scratch instance. Record unavailable checks individually rather than claiming a pass. No `npm run check`, automatic fixer, or merge.

Final diff-scoped lint, typecheck, server tests, and web tests passed. `npm run docs:build` and `npm run build:web` passed. A source-map build confirmed each concrete tab plugin remains in its own chunk, no shell module is in the entry chunk, and the ACP response panel/provider are core entry modules. The web build reports config-loader, Node externalization, and large-chunk warnings; these do not fail the build. No build-generated tracked files changed.

The final `./scripts/run.mjs pr-check-gate` passed full typecheck, lint, and tests: 862 files passed, 12373 tests passed, and the same one pre-existing skipped test remained. Lint reports only the baseline warning in `web/src/shared/fuzzy-match.ts`. No test was skipped or lint rule weakened by this change.

The final dead-code scan matches the two baseline declarations exactly; no newly orphaned declaration or dependency was found. Keep `RemoteChip` and `TabPluginLaunchReady` untouched.

Live checks were unavailable: both `JANISSARY_BROWSER_WS_ENDPOINT` and `JANISSARY_PLAYWRIGHT` are absent. Agent ACP exclusion and executable messaging, shell streaming/tools/questions/reset, docked ownership, and remote shell ACP were each skipped for that reason. No scratch instance or standalone browser was started. Automated coverage exercises contextual exclusion, executable requests, generic plugin ownership and deadline exemption, session reuse/reset, stale callbacks, response projection, reset cancellation of active/queued ACP questions while retaining other questions, terminal-free core dispatch, streamed Markdown, docked answers, and scoped keyboard controls. Retained transport/model/remote and shared-consumer tests remain unchanged.

## Out of scope

Removing ACP transport, replacing shared monitor/conversation/editor sessions, changing the default provider or tool set, enabling ACP on other bundled plugins, adding an ACP plugin, implementing agent-tab ACP compatibility, migrating or cleaning saved data, modifying the separate command-queue PR, removing pre-existing dead code, and merging the PR.

## Rebase adaptation

Rebased onto master after the command-queue change (#1596) and notification path abbreviation (#1597) landed. Agent dispatch remains immediate with no queue, while shell tabs retain the generalized core queue and consume the core ACP panel independently. The plugin reference retains both the queue and ACP usage sections. The ACP readiness comment now describes supported core entry points; the existing readiness checks remain intact. The selected environment-inheritance backlog entry stays deleted, and the interruption entry had already been deleted on master. Contextual resolution, scoped start/prompt/reset, streaming, question cancellation, remote transport, shared consumers, and their coverage remain present. No ACP implementation goal changed.
