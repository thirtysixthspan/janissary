import { noFileOpener, type TabPluginActivation, type TabPluginServerCapabilities } from '../api.js';
import {
  isConnectionsPayload, isIdIntent, isKindIdOwnerIntent, type ConnectionKind, type ConnectionRow,
} from './shared.js';
import { runConnectionsCommand } from './command.js';
import { ConnectionTabs, connectionsData } from './tabs.js';

type RowTarget = { kind: ConnectionKind; id: string; ownerLabel: string };

function rowForId(rows: ConnectionRow[], id: string, kind?: string): ConnectionRow | undefined {
  return rows.find((row) => row.id === id && (kind === undefined || row.kind === kind));
}

function rowForTarget(rows: ConnectionRow[], target: RowTarget): ConnectionRow | undefined {
  return rows.find((row) => row.kind === target.kind && row.id === target.id
    && row.ownerLabel === target.ownerLabel);
}

function openOrClose(name: 'open' | 'close', row: ConnectionRow | undefined, tabs: ConnectionTabs, capabilities: TabPluginServerCapabilities): null {
  if (!row) return capabilities.rejectRequest(`invalid ${name} payload`);
  switch (name) {
    case 'open': {
      if (row.type === 'record') tabs.openRecord(row, capabilities);
      else capabilities.topicAction({ topic: 'connections', action: 'open', kind: row.kind, id: row.id, ownerLabel: row.ownerLabel });
      break;
    }
    case 'close': {
      if (row.type === 'live') capabilities.topicAction({ topic: 'connections', action: 'close', kind: row.kind, id: row.id, ownerLabel: row.ownerLabel });
      else if (row.kind === 'acp' && ['Idle', 'Running'].includes(row.status)) {
        return recordAction('close-session', row.id, capabilities);
      } else capabilities.rejectRequest(`invalid ${name} payload`);
      break;
    }
  }
  return null;
}

function recordAction(name: string, id: string, capabilities: TabPluginServerCapabilities): null {
  let refusal: string | undefined;
  switch (name) {
    case 'cancel': { refusal = capabilities.topicAction({ topic: 'connections', action: 'cancel', id }); break; }
    case 'close-session': { refusal = capabilities.topicAction({ topic: 'connections', action: 'closeSession', id }); break; }
    case 'terminate': { refusal = capabilities.topicAction({ topic: 'connections', action: 'terminate', id }); break; }
    case 'delete': { refusal = capabilities.topicAction({ topic: 'connections', action: 'delete', id }); break; }
    default: { capabilities.topicAction({ topic: 'connections', action: 'loadOlder', id }); }
  }
  if (refusal !== undefined) return capabilities.rejectRequest(refusal);
  return null;
}

function intent(
  request: { intent: string; payload: unknown; tabPayload: unknown },
  tabs: ConnectionTabs,
  capabilities: TabPluginServerCapabilities,
): null {
  if (!isConnectionsPayload(request.tabPayload)) return capabilities.reportFailure('invalid connections tab payload');
  if (request.intent === 'open-record') {
    if (!isIdIntent(request.payload)) return capabilities.rejectRequest('invalid open-record payload');
    const row = rowForId(connectionsData(capabilities).rows, request.payload.id);
    if (!row || row.type !== 'record') return capabilities.rejectRequest('invalid open-record payload');
    tabs.openRecord(row, capabilities);
    return null;
  }
  if (request.intent === 'open' || request.intent === 'close') {
    if (!isKindIdOwnerIntent(request.payload)) return capabilities.rejectRequest(`invalid ${request.intent} payload`);
    const row = rowForTarget(connectionsData(capabilities).rows, request.payload);
    return openOrClose(request.intent, row, tabs, capabilities);
  }
  const validIdIntents = ['cancel', 'close-session', 'terminate', 'delete', 'load-older'];
  if (validIdIntents.includes(request.intent)) {
    if (!isIdIntent(request.payload)) return capabilities.rejectRequest(`invalid ${request.intent} payload`);
    return recordAction(request.intent, request.payload.id, capabilities);
  }
  return capabilities.rejectRequest(`unknown connections intent "${request.intent}"`);
}

export function activate(): TabPluginActivation {
  const tabs = new ConnectionTabs();
  return {
    isPayload: isConnectionsPayload,
    opener: noFileOpener('connections'),
    command: (argument, capabilities, name = 'connections') => runConnectionsCommand(argument, name, tabs, capabilities),
    notify: (event, capabilities) => {
      if (event.topic !== 'connections') return;
      tabs.update(event, capabilities);
    },
    intent: (request, capabilities) => intent(request, tabs, capabilities),
    dispose: () => tabs.dispose(),
  };
}
