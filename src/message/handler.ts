import type { Controller } from '../controller.js';
import type { ClientMessage, ServerEvent } from '../protocol.js';
import { dispatchFileNavigatorMessage } from './file-navigator.js';
import { dispatchPluginMessage } from './plugin.js';
import { dispatchTabMessage } from './tabs.js';
import {
  clientReplyMode, unhandledClientMethod,
} from '../client-message.js';
import { errorText } from '../error-text.js';

type Reply = (event: ServerEvent) => void;
type DeferredCallback = (resolve: (value: unknown) => void) => void;

function isDeferredCallback(value: unknown): value is DeferredCallback {
  return typeof value === 'function';
}

function isPromise(value: unknown): value is Promise<unknown> {
  return value instanceof Promise;
}

async function projectFiles(controller: Controller): Promise<unknown> {
  try {
    return await controller.projectFiles();
  } catch {
    return controller.projectFilesFallback();
  }
}

function dispatch(controller: Controller, message: ClientMessage, send: Reply): unknown {
  switch (message.method) {
    case 'init': { send(controller.stateEvent()); break;
    }
    case 'command':
    case 'setActiveTab':
    case 'focusTab':
    case 'closeTab':
    case 'renameTab':
    case 'promoteToTerminal':
    case 'editQueuedCommand':
    case 'deleteQueuedCommand':
    case 'moveTab':
    case 'moveTabToOtherPane':
    case 'reorderTab':
    case 'reorderTabTo':
    case 'toggleCollapse':
    case 'revealNotifications':
    case 'chooseRoute':
    case 'setDock':
    case 'openFileNavigatorFor':
    case 'launchAgentFor':
    case 'openTranscriptFor':
    case 'openHarnessTranscriptFor':
    case 'openAcpTranscript': {
      return dispatchTabMessage(controller, message);
    }
    case 'closeHarnessLaunch': { controller.closeHarnessLaunch(); break;
    }
    case 'closeScheduleLaunch': { controller.closeScheduleLaunch(); break;
    }
    case 'remoteSession': {
      return controller.remoteSession(message.params.action, message.params.label);
    }
    case 'answerQuestion': {
      controller.answerQuestion(message.params.tab, message.params.id, message.params.answer);
      break;
    }
    case 'complete': { return controller.complete(message.params.text, message.params.cursor);
    }
    case 'resize': { controller.resize(message.params.cols, message.params.rows); break;
    }
    case 'ptyInput': { controller.ptyInput(message.params.id, message.params.data); break;
    }
    case 'ptyResize': { controller.ptyResize(message.params.id, message.params.cols, message.params.rows); break;
    }
    case 'ptyKill': { controller.ptyKill(message.params.id); break;
    }
    case 'runSuggestion': { controller.runSuggestion(message.params.id); break;
    }
    case 'rateSuggestion': { controller.rateSuggestion(message.params.id, message.params.up); break;
    }
    case 'resetMonitorContext': { controller.resetMonitorContext(message.params.name); break;
    }
    case 'monitorContextSnapshot': { controller.monitorContextSnapshot(message.params.name); break;
    }
    case 'saveFile': { return controller.saveFile(message.params.url, message.params.content); }
    case 'defaultMenuSelectionAction':
    case 'runDefaultMenuSelectionAction':
    case 'pluginIntent':
    case 'pluginFailed':
    case 'editorPluginFailed': {
      return dispatchPluginMessage(controller, message);
    }
    case 'editorSync': { controller.syncEditorBuffer(message.params.url, message.params.content); break;
    }
    case 'resyncEditorTab': { controller.resyncEditorTab(message.params.url); break;
    }
    case 'renameEditorFile': { controller.renameEditorFile(message.params.url, message.params.name); break;
    }
    case 'commitEditorFile': { controller.commitEditorFile(message.params.url, message.params.message); break;
    }
    case 'reportLayout': { controller.reportLayout(message.params); break;
    }
    case 'fileNavigatorToggle':
    case 'fileNavigatorCollapseAll':
    case 'fileNavigatorPull':
    case 'fileNavigatorCommit':
    case 'fileNavigatorNothingToCommit':
    case 'fileNavigatorSetDetail':
    case 'fileNavigatorReroot':
    case 'moveFileNavigatorItem':
    case 'moveFileNavigatorItems':
    case 'deleteFileNavigatorItem':
    case 'deleteFileNavigatorItems':
    case 'pasteFileNavigatorItems':
    case 'reportFileNavigatorSelection':
    case 'renameFileNavigatorItem':
    case 'fileNavigatorSearch':
    case 'revealFileNavigatorItem':
    case 'fileNavigatorOpeners':
    case 'fileNavigatorOpen':
    case 'fileNavigatorCreateFile':
    case 'fileNavigatorCreateDirectory':
    case 'fileNavigatorSelectionAction':
    case 'runFileNavigatorSelectionAction':
    case 'undoFileNavigatorItem':
    case 'redoFileNavigatorItem': {
      return dispatchFileNavigatorMessage(controller, message);
    }
    case 'projectFiles': {
      return projectFiles(controller);
    }
    case 'editorPersonas': { return { names: controller.editorPersonas() };
    }
    case 'editorSuggest': {
      return (resolve: (value: unknown) => void) => {
        controller.editorSuggest(message.params, resolve);
      };
    }
    case 'closeEditorConnection': {
      controller.closeEditorConnection(message.params.url, message.params.persona);
      break;
    }
    default: { return unhandledClientMethod(message);
    }
  }
}

export function handle(controller: Controller, message: ClientMessage, reply: Reply): void {
  const mode = clientReplyMode(message.method);
  if (!mode) return;
  try {
    const result = dispatch(controller, message, reply);
    if (mode === 'deferred') {
      const resolve = (value: unknown) => {
        reply({ t: 'rpc-reply', id: message.id, result: value });
      };
      if (isDeferredCallback(result)) result(resolve);
      else {
        void Promise.resolve(result).then(resolve, (error: unknown) => {
          reply({ t: 'rpc-reply', id: message.id, error: errorText(error) });
        });
      }
      return;
    }
    if (isPromise(result)) {
      void result.then(
        (value) => reply({ t: 'rpc-reply', id: message.id, result: mode === 'ack' ? 'ok' : value }),
        (error: unknown) => reply({ t: 'rpc-reply', id: message.id, error: errorText(error) }),
      );
      return;
    }
    reply({
      t: 'rpc-reply',
      id: message.id,
      result: mode === 'ack' ? 'ok' : result,
    });
  } catch (error) {
    reply({ t: 'rpc-reply', id: message.id, error: errorText(error) });
  }
}
