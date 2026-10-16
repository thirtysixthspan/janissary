# System schedules 01: hidden tab placement and user-close semantics

**Complexity: 6/10**

The main risk is keeping focus, close, split placement and retained client mounts consistent across existing entry points. Startup/recovery, queue provenance and scheduling are separate later contracts, so this remains a bounded tab-lifecycle change.

## Goal

Provide the tab-state foundation for a hidden system shell: explicit focus reveals it, navigation skips it, and user close hides it while preserving its resources. This is the first subplan of `product/plans/ready/add-system-schedules.md` (the authoritative 7/10 plan). Publish all thirteen draft subplans before implementation. Implement in filename order, improving and publishing each plan immediately before its implementation.

## Rebased baseline for all thirteen plans

These drafts target master at `d21c4211`, rebased from `6b5bef28`. The incoming commit removes `--relaunch`; interpret the source plan's historical references as ordinary application restarts. There is one startup path: `clearStateDirectories()` clears per-run artifacts and workspaces on every launch, `bin/janus.mjs` truncates `server.log`, and `startServer` unconditionally calls `controller.reattachSessions()` after the launch shell opens. `CliArgs` and `ServerOptions` have no relaunch property. Use current `cli`, `application-state`, `state-directory`, `sessions-tab` and `remote-server` specs for that baseline. Profile relaunch and remote name-retry callbacks remain valid concepts. Preserve the canonical source file and its 7/10 rating; the coverage map is in 13.

## Decisions and dependencies

- Dependencies: none. Test the new state using tab fixtures; startup creates the real system shell in 03.
- Add optional `hidden: true` and `systemShell: true` to server `Tab` and shared `TabView`. Absence preserves current behavior. `systemShell` identifies the managed tab even when revealed; an alias or a label comparison alone is insufficient lifecycle identity.
- Keep hidden tabs in the complete server/client array, with their original RPC indices, queues, payloads, PTYs, and schedules. Filter presentation and navigation, never the broadcast array. Reuse the existing persistent `MountedViewLayers`/`PluginTabLayer` path with `display: none` and `active: false`; add no second consumer or mount point.
- `setActiveTab` is the common reveal seam, so `tab focus`, notification links, existing focus RPCs, and later schedule-row focus all reveal through one operation. Explicitly focusing a docked tab must make it visible through the existing undock/focus semantics.
- Introduce a user-close operation distinct from destructive `TabManager.closeTab`. The former hides a system shell and otherwise delegates to the latter. Normal user close never tears down resources, clears its queue, or emits a confirmation/message for the system tab. Plugin disable and shutdown remain destructive.
- The system shell never counts toward last-non-docked-tab quit, including while revealed. Closing it never quits. Hidden tabs and docked tabs do not keep the application alive. Hiding restores the previous eligible focused tab, then the nearest visible strip tab, repairing both panes and dwell state as close does.
- Reserve `system` case-insensitively for user launch labels and aliases, even before a managed shell exists. The fixed internal startup origin is exempt. Refusal: `Cannot use "system": that name is reserved for the system tab.`

## Existing code to reuse

`src/tab/placement.ts` already shares placement and `closeQuitsApp` with the web app. `operations.ts`, `focus-history.ts`, `split-selection.ts`, `navigation-commands.ts`, and `close.ts` own focus repair and resource release. `byLabelOrAlias` supplies command lookup. The client already mounts every non-docked plugin independently of strip eligibility. `src/launch-name/local.ts` is the real typed shell/harness naming gate; `unique-labels.ts` alone does not reserve typed names.

## File scope

- Server: `src/tab/{types,view,placement,manager,operations,navigation-commands,focus-history,selection-operations,split-selection,close,reorder,unique-labels,rename}.ts`; `src/protocol/tab.ts`; new `src/tab/{visibility,user-close,reserved-label}.ts`; `src/controller/tab-adapter.ts`; `src/message/tabs.ts`; `src/commands/{close,rename,index}.ts`; new `src/commands/tab.ts`; `src/launch-name/{check,local}.ts`; `src/plugins/{launch-tab-label,topics}.ts` for fixed-origin exemption and common focus integration.
- Client: `web/src/{App,MountedViewLayers,AppCenterActionArea}.tsx`, `web/src/useTabEntries.ts`; `web/src/plugins/PluginTabLayer.tsx`; `web/src/pickers/tab-nav-match.ts`; `web/src/shared/command-bar/classify-submit.ts`. Most filters should inherit the shared placement predicate rather than duplicating it.
- Anticipated extracts: `src/tab/visibility.ts` owns hide/reveal and focus repair; `src/tab/user-close.ts` owns the user-close decision; `src/tab/reserved-label.ts` owns the literal refusal. Extract placement/focus code cohesively if a changed production file would exceed 200 lint-counted lines.
- Tests: existing `src/tab/{placement,operations,focus-history,split-selection,close,reorder,rename-editor,manager,view}.test.ts`, `src/commands/{close,rename}.test.ts`, `src/launch-name/{check,local}.test.ts`, `src/plugins/{topics,launch-origin,launch-tab}.test.ts`, `src/controller{,/tab-adapter}.test.ts`, and `src/message/handler.test.ts`; new tests beside new visibility/user-close/reserved-label modules and new `src/commands/tab.test.ts`. Client references are relative to `web/src/`: existing `App.test.tsx`, `useTabEntries.test.ts`, `MountedViewLayers.test.tsx`, `plugins/PluginTabLayer.test.tsx`, `pickers/tab-nav-match.test.ts`, `shared/command-bar/classify-submit.test.ts`, and `useCmdW.test.tsx`. Add `src/tab/hidden-lifecycle.integration.test.ts` for the full intent/state round trip. A focused `src/message/tabs.test.ts`, if useful, is new rather than an existing test seam.
- Specs/docs: `product/specs/{tabs,tab-navigator,keyboard-navigation,quit-confirmation,application-commands}.md`; alphabetical `help.md` entry for `tab focus`.

## Ordered changes

1. Add optional shared state and pure placement/quit predicates. Check all placement callers: split selection, reorder, profile placement, current/secondary selection, client strip entries, and navigator matching. Fix unsplit focus repair too; its current early return can preserve an ineligible active index.
2. Implement hide/reveal and focus restoration with no cleanup. Wire explicit focus RPC and the new single registry command `tab focus <name>` through canonical lookup. A miss returns `No tab named "<label>".`; malformed input gets a command-specific usage result.
3. Route `close`/`exit`, named close, and controller/RPC close used by strip ×, Cmd+W/Ctrl+W, sidebar, and plugin close through user-close. Keep low-level destructive callers (plugin teardown, profile replacement, resource cleanup) distinct. Process-exit recovery is completed in 03.
4. Update shared client quit classification and host visibility so a system close opens no quit dialog. Preserve unsaved-work guards for ordinary tabs. Assert hidden mounted bodies are inactive and receive no overlay or focus.
5. Enforce reserved launch/rename names through both command and RPC paths, including alias rename and editor rename before disk changes. Return the refusal through existing result channels without also printing a false rename-success message. Keep default-name allocation from selecting the reserved name.
6. Update specs and help for the delivered tab behavior; run the scoped checks.

## Tests and verification

Test hidden strip/nav/next/Shift+arrow exclusion, canonical indices, explicit label/alias focus, notification-style focus RPC reveal, ordinary tab regression, focus-history fallback with stale/docked/hidden entries, split collapse, reordering around hidden members, and visible/revealed system quit counting. Cover every user-close entry point and assert no PTY release, schedule deletion, queue loss, message, or quit confirmation on system close. Pin destructive teardown separately. Test reserved launch/alias/editor-RPC refusal and fixed internal-origin exemption.

Run `./scripts/run.mjs check-diff` after changes. Meaningful scope E2E: the new controller/RPC integration test should create real manager-owned fixture tabs, drive command and close/focus RPC dispatch, and inspect broadcast `TabView`, active/secondary selection, and resource lifetime rather than just testing predicates. Client integration must mount a hidden plugin body once, hide/reveal it, and prove no remount or duplicate consumer. The real-zsh startup/browser checks follow in 03 and 13.

## Boundaries

This plan delivers the shared tab contract and `tab focus`, not startup, persistence, firing, runscript commands, or harness postfixes. Do not remove hidden tabs from `view()` or change tab-owned schedule firing. Later plans may extend only the explicitly shared lifecycle seams. All source-plan exclusions remain in force.
