import type { ClientMessage } from './protocol.js';

export type ClientReplyMode = 'ack' | 'result' | 'deferred';

export const CLIENT_METHOD_CONTRACTS = {
  answerQuestion: 'ack',
  chooseRoute: 'ack',
  closeEditorConnection: 'ack',
  closeHarnessLaunch: 'ack',
  closeScheduleLaunch: 'ack',
  closeTab: 'ack',
  command: 'ack',
  complete: 'result',
  deleteFileNavigatorItem: 'ack',
  deleteFileNavigatorItems: 'result',
  deleteQueuedCommand: 'ack',
  editQueuedCommand: 'ack',
  editorPersonas: 'result',
  editorPluginFailed: 'ack',
  editorSuggest: 'deferred',
  editorSync: 'ack',
  fileNavigatorCollapseAll: 'ack',
  fileNavigatorOpeners: 'result',
  fileNavigatorReroot: 'ack',
  fileNavigatorSearch: 'deferred',
  fileNavigatorSelectionAction: 'result',
  fileNavigatorSetDetail: 'ack',
  fileNavigatorToggle: 'ack',
  focusTab: 'ack',
  init: 'ack',
  launchAgentFor: 'ack',
  monitorContextSnapshot: 'ack',
  moveFileNavigatorItem: 'ack',
  moveFileNavigatorItems: 'result',
  moveTab: 'ack',
  moveTabToOtherPane: 'ack',
  openAcpTranscript: 'ack',
  openFileNavigatorFor: 'ack',
  openHarnessTranscriptFor: 'ack',
  openTranscriptFor: 'ack',
  pasteFileNavigatorItems: 'result',
  projectFiles: 'deferred',
  promoteToTerminal: 'ack',
  ptyInput: 'ack',
  ptyKill: 'ack',
  ptyResize: 'ack',
  pluginFailed: 'ack',
  pluginIntent: 'deferred',
  rateSuggestion: 'ack',
  redoFileNavigatorItem: 'result',
  renameFileNavigatorItem: 'ack',
  renameTab: 'ack',
  reorderTab: 'ack',
  reorderTabTo: 'ack',
  reportFileNavigatorSelection: 'ack',
  reportLayout: 'ack',
  resetMonitorContext: 'ack',
  resize: 'ack',
  resyncEditorTab: 'ack',
  revealFileNavigatorItem: 'ack',
  runFileNavigatorSelectionAction: 'ack',
  runSuggestion: 'ack',
  saveFile: 'ack',
  setActiveTab: 'ack',
  setDock: 'ack',
  toggleCollapse: 'ack',
  undoFileNavigatorItem: 'result',
} as const satisfies Record<ClientMessage['method'], ClientReplyMode>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isPluginIntentParams(value: unknown): value is {
  tab: string;
  intent: string;
  payload: unknown;
} {
  return isRecord(value)
    && typeof value.tab === 'string'
    && typeof value.intent === 'string'
    && Object.hasOwn(value, 'payload');
}

export function isPluginFailedParams(value: unknown): value is { tab: string; reason: string } {
  return isRecord(value)
    && typeof value.tab === 'string'
    && typeof value.reason === 'string';
}

export function isEditorPluginFailedParams(
  value: unknown,
): value is { url: string; plugin: string; reason: string } {
  return isRecord(value)
    && typeof value.url === 'string'
    && typeof value.plugin === 'string'
    && typeof value.reason === 'string';
}

export function clientReplyMode(value: unknown): ClientReplyMode | undefined {
  if (typeof value !== 'string' || !Object.hasOwn(CLIENT_METHOD_CONTRACTS, value)) return undefined;
  return CLIENT_METHOD_CONTRACTS[value as keyof typeof CLIENT_METHOD_CONTRACTS];
}

function isClientMethod(value: unknown): value is ClientMessage['method'] {
  return clientReplyMode(value) !== undefined;
}

export function isClientMessage(value: unknown): value is ClientMessage {
  return isRecord(value)
    && value.t === 'rpc'
    && typeof value.id === 'number'
    && isClientMethod(value.method)
    && isRecord(value.params);
}
