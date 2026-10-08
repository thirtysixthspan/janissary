# Remove agent tabs

**Complexity: 8/10** — agent creation, transcript rendering, messaging, remote reattachment, and shared command infrastructure span both applications.

## Goal

Remove local and remote transcript-based agent tabs and the `agent`, `msg`, and `broadcast` commands. Keep harnesses, shell tabs, conversations, Sessions, and every other view working.

## Approach and settled scope

1. Remove both local and remote agent tabs, keeping every other tab type.
2. Replace harness and conversation new-agent buttons with new-shell buttons that join the same workspace, directory, group, and remote connection where applicable.
3. Cmd+T opens zsh outside shell tabs; shell tabs retain their sibling-shell action.
4. Agent-only full-tab PTY takeovers, automatic promotion, their Ctrl+O/RPC action, interactive-detection setting, and learned-command loader go with the agent body. Old configuration/state remains tolerated and untouched. Keep naming, workspace/sandbox, ACP, command dispatch, command bars, transcript rendering for notifications/core ACP, and application-command reply capture where surviving consumers need them. Delete agent-only branches and the messaging manager/capture dispatcher.
5. Update current specs, documentation, help, navigation, screenshots, and architecture guidance. Preserve completed plans and changelog history.
6. Remove `msg` and `broadcast`, retaining `send` for harness and shell input.
7. Delete mixed backlog entries about task orchestration, workspace diff/review, shared viewing, navigator previews, notes, branch controls, and image attachments, plus entries solely about the removed feature.
8. Keep Sessions by extracting a temporary SSH/harness authentication bridge from agent launch. Restore only surviving shell/harness tabs. Tolerate existing agent records and remote processes without converting, deleting, or recreating them.
9. The user explicitly permits updating surviving tests' imports, fixtures, and expected shell-launch wiring while preserving assertions and coverage for surviving behavior. This overrides the removal playbook's narrower test-edit restriction.
10. Publish plugin API v2, preserving the frozen v1 implementation and adapting host tests to reject v1 while exercising v2 round trips.
11. Keep inline monitoring and deliver completed suggestions and question replies into the owning shell’s visible output; preserve reporting-tab mode.
12. The user explicitly authorized fixing the red baseline and proceeding. Include the verified plugin mount-deadline correction in `web/src/plugins/registry.tsx`; mounting is acknowledged in a layout effect.

## Implementation steps

1. Remove server creation and messaging: `src/commands/{agent,msg,broadcast}.ts` and their tests, `src/agent/{commands,types,communication-manager,message-queue}.ts`, `src/messaging.ts`, `src/profile/{new-agent,place-agent,remote-agent}.ts`, and their feature tests. Detach registries, completion, managers, controller adapters, message dispatch, RPC validation, tab cleanup, and notification delivery. Keep `src/capture/execute-and-capture.ts`; remove the messaging-only capture manager/router and hooks. Adapt mixed tests in those areas.
2. Replace agent-launch buttons through the existing shell plugin in `src/conversations/`, `src/plugins/{conversations,topics,api-topics,api,launch-tab}*`, `src/controller/file/navigator-adapter.ts`, and `web/src/{harness,shared,plugins/conversations,plugins/shell}/`. Add a narrow shared shell-opening helper if needed. Preserve workspace lifetime ownership. Update corresponding tests.
3. Extract the Sessions authentication bridge into `src/sessions/`, detach agent restoration in `src/sessions/{attach,restore-tabs,snapshot,rows,store,manager}.ts` and related wire/UI types as needed. Keep loader tolerance for existing data. Adapt Sessions tests and remove agent-only round-trip cases.
4. Remove agent UI bodies and command-input modules under `web/src/agent-tabs/`; move any genuinely shared modules needed by app composition/tests into `web/src/shared/command-bar/`. Detach `App.tsx`, `AppMain.tsx`, `AppCenterActionArea.tsx`, window chords, focus/search/scroll coordination, `ShellTabLayer`, and related app hooks. Remove agent-only wire variants and branches from `src/tab/`, `src/protocol/`, and client view handling. Keep neutral tab factories and shared test fixtures needed by surviving tests. Adapt affected tests and ESLint boundary declarations.
5. Update `help.md`, `README.md`, current `product/specs/*.md`, `documentation/**/*.md`, `documentation/diagrams/architecture.html`, `documentation/.vitepress/config.mts`, `ai/guidelines/{architecture-principles,plugins-tabs}.md`, and `scripts/docs-screenshots/{manifest,reset}*` wherever they reference removed behavior. Delete messaging-only pages and screenshots; retain and rewrite shared naming/workspace pages. Remove obsolete agent-specific styles from `web/src/theme.css` and other affected stylesheets. Remove the agreed entries from `product/backlog/*.md` without changing unrelated entries. Do not edit historical completed plans or changelog sections.
6. Remove newly orphaned declarations/files/dependencies discovered by the dead-code scan, after reference searches, restricted to orphans created by these changes. Move this plan to complete after verification and open a breaking-change PR for human merge.

## Tests

Run `./scripts/run.mjs check-diff` after each stage and repair regressions before proceeding. Preserve surviving test assertions, adapting their setup only within the explicit user exception. Add meaningful coverage for shell workspace joins, metadata-button routing, Cmd+T, unknown removed commands, and the SSH reattachment bridge. Delete feature-only tests and removed-feature assertions from mixed suites.

## Spec updates

Update the current tabs, agents/naming, workspaces, shell, send, conversations, Sessions, command, keyboard, notification, monitoring, profile, state, plugin, and screenshot specs, plus cross-references from other current specs. Delete `product/specs/messaging.md` and its user documentation. Shared workspace/naming specs remain and describe surviving consumers.

## Verification

Initial tree was clean and master current. Dependency lockfile audit passed with three quarantined locked dependencies permitted by policy. Typecheck passed; lint passed with one existing cognitive-complexity warning in `web/src/shared/fuzzy-match.ts`. Initial tests failed on the plugin mount-deadline race; after the authorized fix, all 861 test files passed (12,283 tests passed, one skipped). Diff checks and production web build passed.

Complete pre-removal dead-code baseline:

```text
Unused exports (1)
RemoteChip  web/src/plugins/api.ts:65:10
Unused exported types (1)
TabPluginLaunchReady  type  src/plugins/api.ts:24:27
```

Leave both pre-existing findings alone. Run full `npm run typecheck`, `npm run lint`, `npm test`, `npm run knip`, `npm run docs:build`, and the production web build. Never run `npm run check`. Inspect plugin chunks after registry changes. Run the PR workflow's required hard gate before opening the PR.

Live checks, if the attached browser and runtime permit them: launch-shell startup and application commands; Cmd+T and sibling shells; harness new-shell workspace join; conversation new-shell workspace join; split panes and pickers; surviving `send`; Sessions shell/harness attach. Record each unavailable live check with its actual environment or reachability reason. Use the project-first start/stop application tasks under `temp/remove-an-existing-feature/` and leave no scratch instance running.

## Out of scope

Migrations, cleanup of users' persisted data or remote processes, deprecation shims/warnings, other feature removals, pre-existing dead code, unrelated backlog edits, historical plans/changelogs, and merging the PR.

Final verification: PR hard gate passed: full typecheck and lint (the same pre-existing fuzzy-match warning), 840 test files and 11,871 tests passed with the same one pre-existing skip. Production server/web build and docs build passed. Bundled plugins still emit separate lazy chunks. The dead-code scan reports exactly the baseline findings after removing three new orphans: workspaceAgentCwd, the protocol CompletionResult re-export, and src/command/tokens.ts. No dependency changes were needed. Removed the app-shell agent transcript-search and scroll callbacks; editor search and shell terminal scrolling retain their own handlers. Relaunch skips legacy agent-only Sessions records without connecting or rewriting them.

Live startup/application commands, Cmd+T/sibling shells, harness shell launch, conversation shell launch, split panes/pickers, send, Sessions shell/harness attach, and inline monitor delivery: skipped because JANISSARY_BROWSER_WS_ENDPOINT and JANISSARY_PLAYWRIGHT are both unset. No scratch instance was started.
