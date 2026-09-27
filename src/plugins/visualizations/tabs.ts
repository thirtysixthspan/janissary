import { randomUUID } from 'node:crypto';
import type { TabPluginServerCapabilities, VisualizationsView } from '../api.js';
import {
  isVisualizationsData,
  type VisualizationListPayload,
  type VisualizationTabPayload,
} from './shared.js';

// The list tab's own instance key. A visualization's tab is keyed by the id the host gave its record,
// so a second activation focuses the tab that is already open rather than opening another.
export const LIST_KEY = 'visualizations';

export function dataFrom(capabilities: TabPluginServerCapabilities): VisualizationsView {
  const data = capabilities.topicData('visualizations');
  if (!isVisualizationsData(data)) {
    return capabilities.reportFailure('invalid visualizations topic data');
  }
  return data;
}

export function listPayload(data: VisualizationsView): VisualizationListPayload {
  return { kind: 'list', entries: [...data.summaries] };
}

function windowPayload(data: VisualizationsView, id: string): VisualizationTabPayload | undefined {
  const window = data.windows.find((entry) => entry.id === id);
  return window ? { kind: 'visualization', window, models: [...data.models] } : undefined;
}

export class VisualizationTabs {
  // Create the record, then open its tab. The host refuses an id it already holds, and a record whose
  // window is missing is a host that lost it — a failure here rather than a tab with nothing in it.
  // The first message is optional: the index's plus control sends none, and the default menu's
  // **Visualize this** sends the current selection.
  create(input: { message?: string }, capabilities: TabPluginServerCapabilities): void {
    const id = randomUUID();
    const message = input.message?.trim();
    capabilities.topicAction({
      topic: 'visualizations',
      action: 'create',
      id,
      ...(message !== undefined && message !== '' && { message }),
    });
    const payload = windowPayload(dataFrom(capabilities), id);
    if (!payload) return capabilities.reportFailure('created visualization is unavailable');
    capabilities.openOrFocusTab(id, () => ({
      title: payload.window.title,
      payload,
    }));
  }

  open(id: string, capabilities: TabPluginServerCapabilities): void {
    capabilities.topicAction({ topic: 'visualizations', action: 'load', id });
    const payload = windowPayload(dataFrom(capabilities), id);
    if (!payload) return;
    capabilities.openOrFocusTab(id, () => ({ title: payload.window.title, payload }));
  }

  // Repaint every tab this plugin has open. The list takes the payload alone: what it shows has
  // nothing to do with the name in the tab strip, so no title is sent with it. A record's tab takes
  // its title too, because a chart's own title is what names the tab.
  update(data: VisualizationsView, keys: readonly string[], capabilities: TabPluginServerCapabilities): void {
    for (const key of keys) {
      if (key === LIST_KEY) {
        capabilities.updateTab(key, () => ({ payload: listPayload(data) }));
        continue;
      }
      const payload = windowPayload(data, key);
      if (payload) capabilities.updateTab(key, () => ({ title: payload.window.title, payload }));
    }
  }
}
