# technical-debt

## ready

## development

* Send a changed tab view for transcript writes so shell and ACP output do not rebuild every tab.

Existing Debt: Transcript mutations collapse to a generic state-dirty signal, so `buildStateEvent` in `src/state/event.ts` calls `controller.view()` and `buildTabViews` in `src/tab/view.ts` flattens every tab's log even when only one changed; `src/index.ts` then JSON-stringifies that full snapshot for every client, and `src/state/listings.ts` already caches disk listings because this path fires on output chunks and keystrokes. Severity: 6/10

Existing Risk: 5/10 - As tabs and transcripts grow, each shell or ACP output update repeatedly formats and allocates all other tabs and sends the full payload to every window, delaying unrelated interactions and increasing socket traffic.

Proposal Risk: 3/10 - A transcript update would still format the changed tab's complete capped buffer, and unrelated state changes would still send full snapshots, so very large individual tabs would retain some cost.

Proposal: `appendTab`, `updateRunningEntry`, and `clearTranscriptTab` in `src/tab/transcript/events.ts` already identify the changed tab and mutate its log; give those mutations a targeted tab-dirty signal and have `wireControllerEvents` in `src/controller/events.ts` project that label to one `TabView`. Add a single-tab projection in `src/tab/view.ts` and expose it through `src/tab/manager.ts` and `src/controller.ts`, then add a `tab-view-updated` member to `ServerEvent` in `src/protocol/events.ts`; `src/index.ts` should broadcast that event while `buildStateEvent` in `src/state/event.ts` remains the full snapshot path for `init` and unrelated state changes. In `web/src/shared/ws/ws.ts`, merge the updated tab into `latestState` by label and notify `onState` subscribers so current and late subscribers see a consistent snapshot. Suppress the corresponding generic dirty broadcast for these transcript paths only, after confirming the targeted view includes busy, unread, cleared, and capped-log changes. `src/tab/transcript/events.test.ts` covers append, running-entry rewrite/finalize, clear, unread, and revision behavior; `src/index.test.ts` covers initialization and streamed transcript snapshots; `web/src/shared/ws/ws.test.ts` covers state delivery and the retained latest snapshot. Extend those tests for targeted updates and full-snapshot fallback while keeping their existing behavior intact.

* Extract the agent monitor's activity-to-transcript conversion from its view component so both output formats can be tested without rendering the plugin.

Existing Debt: `web/src/plugins/agent-monitor/view.tsx` maps each activity record inline in `RunningMonitor`, choosing `markdown` for messages and `output` with the activity kind prefixed for every other record, in violation of §5 (components render; they do not decide). The format conversion can only be exercised through the mounted view, and its current render test covers a `thought` record but not the message branch. Severity: 4/10

Existing Risk: 4/10 - A change to the activity kind mapping can display a message without Markdown or omit an output kind label, and the current test would not catch a regression in the message branch.

Proposal Risk: 2/10 - A pure conversion function with direct tests for message and output records would catch formatting regressions before render, while the existing view test continues to cover the component wiring.

Proposal: `web/src/plugins/agent-monitor/view.tsx` builds transcript lines inside the `ReadOnlyTranscript` JSX prop. Move that mapping into a new `web/src/plugins/agent-monitor/activity-lines.ts` pure function that accepts `AgentRunView['activity']` and returns `BufferLine[]`; have `RunningMonitor` call it and pass the result to `ReadOnlyTranscript`. Add `web/src/plugins/agent-monitor/activity-lines.test.ts` for the message-to-markdown and other-kind-to-output cases, and keep `web/src/plugins/agent-monitor/view.test.tsx` passing as the render-level check. The change affects one existing source file and one local import; it leaves the component's props and plugin API imports intact, and the existing render test pins the thought text displayed in the monitor.

## deferred

## declined
