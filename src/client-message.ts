import type { ClientMessage } from './protocol.js';

const CLIENT_METHODS = {
  answerQuestion: true,
  cancelSchedule: true,
  chooseRoute: true,
  clearSchedules: true,
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
  pluginIntent: true,
  projectFiles: true,
  ptyInput: true,
  ptyKill: true,
  ptyResize: true,
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

function isClientMethod(value: unknown): value is ClientMessage['method'] {
  return typeof value === 'string' && Object.hasOwn(CLIENT_METHODS, value);
}

// Envelope shape only, as for every other method: a well-formed envelope reaches the handler, and
// the handler validates the params it actually understands. `pluginIntent` carries plugin-supplied
// data, so its deep check lives beside the dispatch that needs it and answers with an ordinary RPC
// error rather than a silently dropped message.
export function isClientMessage(value: unknown): value is ClientMessage {
  return isRecord(value)
    && value.t === 'rpc'
    && typeof value.id === 'number'
    && isClientMethod(value.method)
    && isRecord(value.params);
}
