import type { ClientMessage } from './protocol.js';
import { clientParamsValid } from './client-params/index.js';
import { isRecord } from './client-params/guards.js';

// The dispatcher re-checks these three inside its own arms, so they stay exported predicates rather
// than becoming anonymous entries in the decoder table. They live beside their domain's decoders and
// are re-exported here so `./message-handler.js` keeps importing them from one place.
export { isPluginIntentParams, isPluginFailedParams } from './client-params/plugin.js';
export { isEditorPluginFailedParams } from './client-params/editor.js';

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
  fileNavigatorOpen: 'deferred',
  fileNavigatorPull: 'ack',
  fileNavigatorCreateFile: 'deferred',
  fileNavigatorCreateDirectory: 'deferred',
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

// The `default` branch of every switch that dispatches a `ClientMessage`. The `never` parameter is
// the point: the call only typechecks while every method in that switch's union has a case, so a
// method added to the protocol and to the table above but not to the dispatcher fails the build
// rather than answering the client with a successful reply for work that never ran. The throw is
// the runtime backstop — `handle` turns it into an RPC error naming the method.
export function unhandledClientMethod(message: never): never {
  throw new Error(`Unhandled client RPC method: ${(message as ClientMessage).method}`);
}

export function clientReplyMode(value: unknown): ClientReplyMode | undefined {
  if (typeof value !== 'string' || !Object.hasOwn(CLIENT_METHOD_CONTRACTS, value)) return undefined;
  return CLIENT_METHOD_CONTRACTS[value as keyof typeof CLIENT_METHOD_CONTRACTS];
}

function isClientMethod(value: unknown): value is ClientMessage['method'] {
  return clientReplyMode(value) !== undefined;
}

// The envelope only. An unrecognized one is silently dropped by the caller in `./index.js`, which
// is a deliberately different answer from the one a recognized method with malformed params gets —
// see `clientParamsProblem`.
export function isClientMessage(value: unknown): value is ClientMessage {
  return isRecord(value)
    && value.t === 'rpc'
    && typeof value.id === 'number'
    && isClientMethod(value.method)
    && isRecord(value.params);
}

// The params half, field by field, through the decoder the method names. Returns the error text to
// answer with, or `undefined` when the params decode. Answering rather than dropping is what three
// of these methods already did from inside the dispatcher; every method gets it now, and a deferred
// method's caller sees an error instead of waiting for a reply that would never come.
export function clientParamsProblem(message: ClientMessage): string | undefined {
  return clientParamsValid(message.method, message.params) ? undefined : `Invalid ${message.method} params`;
}
