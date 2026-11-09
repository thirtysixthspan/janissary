import type { ServerEvent, StateEvent } from '@shared/protocol';
import { mergeAgentRunRevision } from './agent-run-merge';

type TabViewUpdatedEvent = Extract<ServerEvent, { t: 'tab-view-updated' }>;

type AgentRunUpdatedEvent = Extract<ServerEvent, { t: 'agent-run-updated' }>;

// Folds a partial server update into the retained snapshot, or undefined when there is nothing to apply.
export function mergePartialState(
  current: StateEvent, event: TabViewUpdatedEvent | AgentRunUpdatedEvent,
): StateEvent | undefined {
  return event.t === 'tab-view-updated' ? mergeTabView(current, event) : mergeAgentRunRevision(current, event);
}

// Replaces the one tab the event names, leaving every other tab and field of the snapshot as it was.
// Returns undefined when the snapshot holds no such tab, so the caller keeps waiting for the full
// snapshot that accompanies any change to the tab set.
export function mergeTabView(current: StateEvent, event: TabViewUpdatedEvent): StateEvent | undefined {
  if (current.tabs.every((tab) => tab.label !== event.tab.label)) return undefined;
  return { ...current, tabs: current.tabs.map((tab) => (tab.label === event.tab.label ? event.tab : tab)) };
}
