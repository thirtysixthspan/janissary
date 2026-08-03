import type { ClientMessage } from './protocol.js';

const CLIENT_METHODS = {
  answerQuestion: true,
  chooseRoute: true,
  closeEditorConnection: true,
  closeHarnessLaunch: true,
  closeScheduleLaunch: true,
  closeTab: true,
  command: true,
  complete: true,
  deleteFileNavigatorItem: true,
  deleteFileNavigatorItems: true,
  deleteQueuedCommand: true,
  editQueuedCommand: true,
  editorPersonas: true,
  editorSuggest: true,
  editorSync: true,
  fileNavigatorCollapseAll: true,
  fileNavigatorOpeners: true,
  fileNavigatorReroot: true,
  fileNavigatorSearch: true,
  fileNavigatorSetDetail: true,
  fileNavigatorToggle: true,
  focusTab: true,
  init: true,
  launchAgentFor: true,
  monitorContextSnapshot: true,
  moveFileNavigatorItem: true,
  moveFileNavigatorItems: true,
  moveTab: true,
  moveTabToOtherPane: true,
  navigatePage: true,
  openAcpTranscript: true,
  openFileNavigatorFor: true,
  openHarnessTranscriptFor: true,
  openTranscriptFor: true,
  pageSync: true,
  pasteFileNavigatorItems: true,
  projectFiles: true,
  ptyInput: true,
  ptyKill: true,
  ptyResize: true,
  pluginFailed: true,
  pluginIntent: true,
  rateSuggestion: true,
  redoFileNavigatorItem: true,
  renameFileNavigatorItem: true,
  renameTab: true,
  reorderTab: true,
  reorderTabTo: true,
  reportFileNavigatorSelection: true,
  reportLayout: true,
  resetMonitorContext: true,
  resize: true,
  resyncEditorTab: true,
  revealFileNavigatorItem: true,
  runSuggestion: true,
  saveFile: true,
  setActiveTab: true,
  setDock: true,
  toggleCollapse: true,
  undoFileNavigatorItem: true,
} as const satisfies Record<ClientMessage['method'], true>;

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

function isClientMethod(value: unknown): value is ClientMessage['method'] {
  return typeof value === 'string' && Object.hasOwn(CLIENT_METHODS, value);
}

export function isClientMessage(value: unknown): value is ClientMessage {
  return isRecord(value)
    && value.t === 'rpc'
    && typeof value.id === 'number'
    && isClientMethod(value.method)
    && isRecord(value.params);
}
