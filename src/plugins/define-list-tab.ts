import type {
  TabPluginNotification,
  TabPluginNotificationTopic,
  TabPluginServerCapabilities,
} from './api.js';
import { parseDockArgument } from './dock-argument.js';

// What a dockable list plugin has to say about itself: which host topic feeds it, the instance key
// its singleton tab is addressed by, the title it opens under, and how a slice of that topic becomes
// its payload. The usage string and the invalid-data reason are derived from the topic, because a
// plugin whose command is `<topic> [left|right]` and whose topic is `<topic>` has no choice about
// either.
//
// `toPayload` returns the tab payload itself, not the `{ title, payload }` pair a capability takes —
// the title is this builder's business, since every dockable list opens under the topic's own name.
export type DockableListOptions<Data> = {
  topic: TabPluginNotificationTopic;
  instanceKey: string;
  title: string;
  isData(value: unknown): value is Data;
  toPayload(data: Data): unknown;
};

// The two shared steps every dockable list plugin otherwise re-implements by hand: the `command` that
// opens or focuses its singleton tab and docks it where the argument says, and the `notify` that
// repaints it when its topic fires. The returned members are the ones `TabPluginActivation` already
// declares, so a plugin adopting this changes nothing else about its activation.
//
// The list is a singleton, so `openOrFocusTab` on an instance key already open is what makes a second
// command focus rather than duplicate, and `updateTab` is what repaints it in place — the tab keeps
// its position, group, and focus, and no title is sent, because the name in the tab strip has nothing
// to do with what the list currently holds.
//
// Both paths narrow the slice through the plugin's own `isData` before mapping it. On the command
// path that is the plugin's existing check, kept exactly. On the notify path it is new: the host
// computes each topic's slice, so a delivery that failed the guard means the two disagree, and
// ignoring it is better than mapping a slice the plugin cannot read.
export function defineDockableList<Data>(options: DockableListOptions<Data>): {
  command(argument: string, capabilities: TabPluginServerCapabilities): void;
  notify(event: TabPluginNotification, capabilities: TabPluginServerCapabilities): void;
} {
  const { topic, instanceKey, title, isData, toPayload } = options;
  return {
    command(argument, capabilities) {
      const dock = parseDockArgument(argument);
      if (dock === undefined) return capabilities.rejectRequest(`Usage: ${topic} [left|right]`);
      const data = capabilities.topicData(topic);
      if (!isData(data)) return capabilities.reportFailure(`invalid ${topic} topic data`);
      capabilities.openOrFocusTab(instanceKey, () => ({ title, payload: toPayload(data) }));
      capabilities.dockTab(instanceKey, dock);
    },
    notify(event, capabilities) {
      if (event.topic !== topic) return;
      // Bound before the guard so the narrowing holds inside the factory below, which runs after
      // this handler has returned.
      const { data } = event;
      if (!isData(data)) return;
      capabilities.updateTab(instanceKey, () => ({ payload: toPayload(data) }));
    },
  };
}
