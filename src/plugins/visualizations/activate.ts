import {
  noFileOpener,
  parseDockArgument,
  type TabPluginActivation,
  type TabPluginServerCapabilities,
} from '../api.js';
import {
  isVisualizationsData,
  isVisualizationsPayload,
  type VisualizationsPayload,
} from './shared.js';
import {
  isChartIntent,
  isChartRefreshIntent,
  isCreateIntent,
  isIdIntent,
  isSendIntent,
} from './intents.js';
import { LIST_KEY, listPayload, dataFrom, VisualizationTabs } from './tabs.js';

const LIST_INTENTS = new Set(['open', 'delete']);

// The intents a record's tab raises, and the topic action each becomes. Every one of them is a thing
// the tab can see itself doing, which is the whole of the grant: the plugin has no route to a source
// it is not already showing, and no route to another record.
export function activate(): TabPluginActivation {
  const tabs = new VisualizationTabs();
  return {
    isPayload: isVisualizationsPayload,
    command: (argument, capabilities) => {
      const dock = parseDockArgument(argument);
      if (dock !== undefined) {
        capabilities.openOrFocusTab(LIST_KEY, () => ({
          title: 'visualizations', payload: listPayload(dataFrom(capabilities)),
        }));
        capabilities.dockTab(LIST_KEY, dock);
        return;
      }
      const title = argument.trim();
      const match = dataFrom(capabilities).summaries.find(
        (summary) => summary.title.toLowerCase() === title.toLowerCase(),
      );
      if (!match) return capabilities.rejectRequest(`No visualization matching "${title}".`);
      tabs.open(match.id, capabilities);
    },
    // The selection becomes the visualization's first message, verbatim. Nothing here inspects it: a
    // URL, a path, and a line of text that is neither are all answered the same way, by the host
    // refusing to read the last and saying so in the conversation.
    defaultMenuAction: (selection, capabilities) => {
      tabs.create({ message: selection }, capabilities);
    },
    notify: (event, capabilities) => {
      if (event.topic !== 'visualizations' || !isVisualizationsData(event.data)) return;
      tabs.update(event.data, event.tabs, capabilities);
    },
    intent: (request, capabilities) => {
      if (!isVisualizationsPayload(request.tabPayload)) {
        return capabilities.reportFailure('invalid visualizations tab payload');
      }
      return runIntent(request.intent, request.payload, request.tabPayload, capabilities, tabs);
    },
    opener: noFileOpener('visualizations'),
  };
}

function runListIntent(
  intent: string,
  value: unknown,
  capabilities: TabPluginServerCapabilities,
  tabs: VisualizationTabs,
): null | never {
  if (!isIdIntent(value)) return capabilities.rejectRequest(`invalid ${intent} payload`);
  if (intent === 'open') tabs.open(value.id, capabilities);
  else capabilities.topicAction({ topic: 'visualizations', action: 'delete', id: value.id });
  return null;
}

// The intents a record's tab raises, and nothing else. A chat is create, send, cancel, undo and the two
// per-chart actions, and keeping them together is what lets this file stay a flat list of guard-then-act
// pairs rather than a dispatcher with branches.
function runRecordIntent(
  intent: string,
  value: unknown,
  id: string,
  capabilities: TabPluginServerCapabilities,
): null | never {
  if (intent === 'send') {
    if (!isSendIntent(value)) return capabilities.rejectRequest('invalid send payload');
    capabilities.topicAction({ topic: 'visualizations', action: 'send', id, query: value.query });
    return null;
  }
  if (intent === 'set-chart-refresh') {
    if (!isChartRefreshIntent(value)) return capabilities.rejectRequest('invalid set-chart-refresh payload');
    capabilities.topicAction({
      topic: 'visualizations', action: 'setChartRefresh', id, chartId: value.chartId, seconds: value.seconds,
    });
    return null;
  }
  if (intent === 'refresh-chart') {
    if (!isChartIntent(value)) return capabilities.rejectRequest('invalid refresh-chart payload');
    capabilities.topicAction({ topic: 'visualizations', action: 'refreshChart', id, chartId: value.chartId });
    return null;
  }
  if (intent === 'undo') {
    if (!isSendIntent(value)) return capabilities.rejectRequest('invalid undo payload');
    capabilities.topicAction({ topic: 'visualizations', action: 'undo', id, query: value.query });
    return null;
  }
  if (intent === 'cancel') {
    if (!isEmptyIntent(value)) return capabilities.rejectRequest('invalid cancel payload');
    capabilities.topicAction({ topic: 'visualizations', action: 'cancel', id });
    return null;
  }
  return capabilities.rejectRequest(`unknown visualizations intent "${intent}"`);
}

function isEmptyIntent(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.keys(value).length === 0;
}

function runIntent(
  intent: string,
  value: unknown,
  tab: VisualizationsPayload,
  capabilities: TabPluginServerCapabilities,
  tabs: VisualizationTabs,
): null | never {
  if (intent === 'create') {
    if (tab.kind !== 'list') return capabilities.rejectRequest('invalid create payload');
    if (!isCreateIntent(value)) return capabilities.rejectRequest('invalid create payload');
    tabs.create(isCreateIntent(value) ? value : {}, capabilities);
    return null;
  }
  if (LIST_INTENTS.has(intent)) {
    if (tab.kind !== 'list') return capabilities.rejectRequest(`invalid ${intent} payload`);
    return runListIntent(intent, value, capabilities, tabs);
  }
  if (tab.kind !== 'visualization') return capabilities.rejectRequest(`invalid ${intent} payload`);
  return runRecordIntent(intent, value, tab.window.id, capabilities);
}
