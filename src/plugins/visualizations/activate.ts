import {
  noFileOpener,
  parseDockArgument,
  type TabPluginActivation,
  type TabPluginServerCapabilities,
} from '../api.js';
import {
  isAnswerIntent,
  isCreateIntent,
  isEmptyIntent,
  isIdIntent,
  isRefreshIntent,
  isSelectModelIntent,
  isSendIntent,
  isSourceIntent,
  isTitleIntent,
  isVisualizationsData,
  isVisualizationsPayload,
  COLUMN_TYPES,
  type VisualizationColumnType,
  type VisualizationsPayload,
} from './shared.js';
import { LIST_KEY, listPayload, dataFrom, VisualizationTabs } from './tabs.js';

const LIST_INTENTS = new Set(['create', 'open', 'delete']);

// The intents a record's tab raises, and the topic action each becomes. Every one of them is a thing
// the tab can see itself doing, which is the whole of the grant: the plugin has no route to a source
// it is not already showing, and no route to another record.
const EMPTY_INTENT_ACTIONS = new Map<string, 'startInterview' | 'cancel' | 'refreshNow' | 'confirmSchema'>([
  ['start-interview', 'startInterview'], ['cancel', 'cancel'], ['refresh-now', 'refreshNow'],
  ['confirm-schema', 'confirmSchema'],
]);

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
    // The selection is the source, verbatim. Nothing here inspects it: a URL, a path, and a line of
    // text that is neither are all answered the same way, by the host refusing to read the last.
    defaultMenuAction: (selection, capabilities) => {
      tabs.create(selection, capabilities);
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
  if (intent === 'create') {
    if (!isCreateIntent(value)) return capabilities.rejectRequest('invalid create payload');
    tabs.create(value.source, capabilities);
    return null;
  }
  if (!isIdIntent(value)) return capabilities.rejectRequest(`invalid ${intent} payload`);
  if (intent === 'open') tabs.open(value.id, capabilities);
  else capabilities.topicAction({ topic: 'visualizations', action: 'delete', id: value.id });
  return null;
}

// The three intents whose payload is the answer, the query, and the interval. They are together
// because they are the ones that move the conversation or the poll, and keeping them apart from the
// three below is what lets each function stay a flat list of guard-then-act pairs.
function runCallIntent(
  intent: string,
  value: unknown,
  id: string,
  capabilities: TabPluginServerCapabilities,
): null | never {
  if (intent === 'answer') {
    if (!isAnswerIntent(value)) return capabilities.rejectRequest('invalid answer payload');
    capabilities.topicAction({
      topic: 'visualizations', action: 'answer', id,
      questionId: value.questionId, answer: value.answer,
    });
    return null;
  }
  if (intent === 'revise') {
    if (!isSendIntent(value)) return capabilities.rejectRequest('invalid revise payload');
    capabilities.topicAction({ topic: 'visualizations', action: 'revise', id, query: value.query });
    return null;
  }
  if (intent === 'set-refresh') {
    if (!isRefreshIntent(value)) return capabilities.rejectRequest('invalid set-refresh payload');
    capabilities.topicAction({
      topic: 'visualizations', action: 'setRefresh', id, seconds: value.seconds,
    });
    return null;
  }
  return capabilities.rejectRequest(`unknown visualizations intent "${intent}"`);
}

// A column type the user corrected: the one intent carrying a value the boundary checks against its own
// grammar rather than passing on as a string. The narrowing is a cast because the guard has already
// established the shape, and this file is the boundary, not a second place to re-derive it.
function isColumnTypeIntent(
  value: unknown,
): value is { column: string; type: VisualizationColumnType } {
  if (typeof value !== 'object' || value === null) return false;
  const { column, type } = value as { column?: unknown; type?: unknown };
  if (typeof column !== 'string' || typeof type !== 'string') return false;
  return (COLUMN_TYPES as readonly string[]).includes(type);
}

// The three that describe the record itself rather than talk to the model: what it is called, where it
// reads from, and which model answers for it.
function runSettingIntent(
  intent: string,
  value: unknown,
  id: string,
  capabilities: TabPluginServerCapabilities,
): null | never {
  if (intent === 'rename') {
    if (!isTitleIntent(value)) return capabilities.rejectRequest('invalid rename payload');
    capabilities.topicAction({ topic: 'visualizations', action: 'rename', id, title: value.title });
    return null;
  }
  if (intent === 'set-source') {
    if (!isSourceIntent(value)) return capabilities.rejectRequest('invalid set-source payload');
    capabilities.topicAction({
      topic: 'visualizations', action: 'setSource', id, source: value.source,
    });
    return null;
  }
  if (intent === 'select-model') {
    if (!isSelectModelIntent(value)) return capabilities.rejectRequest('invalid select-model payload');
    capabilities.topicAction({
      topic: 'visualizations', action: 'setModel', id, pair: { harness: value.harness, model: value.model },
    });
    return null;
  }
  return capabilities.rejectRequest(`unknown visualizations intent "${intent}"`);
}

const CALL_INTENTS = new Set(['answer', 'revise', 'set-refresh']);
const SETTING_INTENTS = new Set(['rename', 'set-source', 'select-model']);

function runRecordIntent(
  intent: string,
  value: unknown,
  id: string,
  capabilities: TabPluginServerCapabilities,
): null | never {
  const bare = EMPTY_INTENT_ACTIONS.get(intent);
  if (bare) {
    if (!isEmptyIntent(value)) return capabilities.rejectRequest(`invalid ${intent} payload`);
    capabilities.topicAction({ topic: 'visualizations', action: bare, id });
    return null;
  }
  if (intent === 'set-column-type') {
    if (!isColumnTypeIntent(value)) {
      return capabilities.rejectRequest('invalid set-column-type payload');
    }
    capabilities.topicAction({
      topic: 'visualizations', action: 'setColumnType', id, column: value.column, type: value.type,
    });
    return null;
  }
  if (CALL_INTENTS.has(intent)) return runCallIntent(intent, value, id, capabilities);
  if (SETTING_INTENTS.has(intent)) return runSettingIntent(intent, value, id, capabilities);
  return capabilities.rejectRequest(`unknown visualizations intent "${intent}"`);
}

function runIntent(
  intent: string,
  value: unknown,
  tab: VisualizationsPayload,
  capabilities: TabPluginServerCapabilities,
  tabs: VisualizationTabs,
): null | never {
  if (LIST_INTENTS.has(intent)) {
    if (tab.kind !== 'list') return capabilities.rejectRequest(`invalid ${intent} payload`);
    return runListIntent(intent, value, capabilities, tabs);
  }
  if (tab.kind !== 'visualization') {
    return capabilities.rejectRequest(`invalid ${intent} payload`);
  }
  return runRecordIntent(intent, value, tab.window.id, capabilities);
}
