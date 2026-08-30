import type { Controller } from './controller.js';
import type { ClientMessage, ServerEvent } from './protocol.js';
import { dispatchFileNavigatorMessage } from './message-handler-file-navigator.js';
import {
  clientReplyMode, isEditorPluginFailedParams, isPluginFailedParams, isPluginIntentParams,
} from './client-message.js';
import { errorText } from './error-text.js';

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
    case 'command': { controller.dispatch(message.params.text); break;
    }
    case 'setActiveTab': { controller.setActiveTab(message.params.index); break;
    }
    case 'focusTab': { controller.focusTab(message.params.label); break;
    }
    case 'closeTab': { controller.closeTab(message.params.index); break;
    }
    case 'renameTab': { controller.renameTab(message.params.index, message.params.title); break;
    }
    case 'promoteToTerminal': { controller.promoteToTerminal(); break;
    }
    case 'editQueuedCommand': { controller.editQueuedCommand(message.params.index, message.params.text); break;
    }
    case 'deleteQueuedCommand': { controller.deleteQueuedCommand(message.params.index); break;
    }
    case 'moveTab': { controller.moveTab(message.params.dir); break;
    }
    case 'moveTabToOtherPane': { controller.moveTabToOtherPane(message.params.index); break;
    }
    case 'reorderTab': { controller.reorderTab(message.params.dir); break;
    }
    case 'reorderTabTo': { controller.reorderTabTo(message.params.from, message.params.to); break;
    }
    case 'toggleCollapse': { controller.toggleCollapse(); break;
    }
    case 'chooseRoute': { controller.chooseRoute(message.params.index); break;
    }
    case 'closeHarnessLaunch': { controller.closeHarnessLaunch(); break;
    }
    case 'closeScheduleLaunch': { controller.closeScheduleLaunch(); break;
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
    case 'pluginIntent': {
      if (!isPluginIntentParams(message.params)) throw new Error('Invalid pluginIntent params');
      return controller.pluginIntent(
        message.params.tab,
        message.params.intent,
        message.params.payload,
      );
    }
    case 'pluginFailed': {
      if (!isPluginFailedParams(message.params)) throw new Error('Invalid pluginFailed params');
      controller.pluginFailed(message.params.tab, message.params.reason);
      break;
    }
    case 'editorSync': { controller.syncEditorBuffer(message.params.url, message.params.content); break;
    }
    case 'resyncEditorTab': { controller.resyncEditorTab(message.params.url); break;
    }
    case 'reportLayout': { controller.reportLayout(message.params); break;
    }
    case 'fileNavigatorToggle':
    case 'fileNavigatorCollapseAll':
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
    case 'setDock': { controller.setDock(message.params.index, message.params.dock); break;
    }
    case 'openFileNavigatorFor': { controller.openFileNavigatorFor(message.params.label); break;
    }
    case 'launchAgentFor': { controller.launchAgentFor(message.params.label); break;
    }
    case 'openTranscriptFor': { controller.openTranscriptFor(message.params.label); break;
    }
    case 'openHarnessTranscriptFor': { controller.openHarnessTranscriptFor(message.params.label); break;
    }
    case 'openAcpTranscript': { controller.openAcpTranscript(message.params.acpRef); break;
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
    case 'editorPluginFailed': {
      if (!isEditorPluginFailedParams(message.params)) {
        throw new Error('Invalid editorPluginFailed params');
      }
      controller.editorPluginFailed(
        message.params.url, message.params.plugin, message.params.reason,
      );
      break;
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
