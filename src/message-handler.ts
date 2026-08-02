import type { Controller } from './controller.js';
import type { ClientMessage, ServerEvent } from './protocol.js';
import { handleFileNavigatorMessage } from './message-handler-file-navigator.js';

export function handle(controller: Controller, message: ClientMessage, reply: (event: ServerEvent) => void): void {
  switch (message.method) {
    case 'init': {
      reply(controller.stateEvent());
      break;
    }
    case 'command': { controller.dispatch(message.params.text); break;
    }
    case 'setActiveTab': { controller.setActiveTab(message.params.index); break;
    }
    case 'focusTab': {
      controller.focusTab(message.params.label);
      break;
    }
    case 'closeTab': { controller.closeTab(message.params.index); break;
    }
    case 'renameTab': { controller.renameTab(message.params.index, message.params.title); break;
    }
    case 'navigatePage': { controller.navigatePage(message.params.index, message.params.url); break;
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
    case 'complete': {
      reply({ t: 'rpc-reply', id: message.id, result: controller.complete(message.params.text, message.params.cursor) });
      return;
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
    case 'saveFile': { controller.saveFile(message.params.url, message.params.content); break;
    }
    case 'editorSync': { controller.syncEditorBuffer(message.params.url, message.params.content); break;
    }
    case 'resyncEditorTab': { controller.resyncEditorTab(message.params.url); break;
    }
    case 'reportLayout': { controller.reportLayout(message.params); break;
    }
    case 'pageSync': { controller.syncPageSnapshot(message.params.url, message.params.text); break;
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
    case 'undoFileNavigatorItem':
    case 'redoFileNavigatorItem': {
      handleFileNavigatorMessage(controller, message, reply);
      return;
    }
    case 'cancelSchedule': { controller.cancelSchedule(message.params.tab, message.params.id); break;
    }
    case 'clearSchedules': { controller.clearSchedules(); break;
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
    // Deferred reply: the listing is async (never blocks the event loop), so the reply fires from
    // the `.then()`/`.catch()` below, not inline — see project-files.ts and protocol.ts.
    case 'projectFiles': {
      void (async () => {
        try {
          reply({ t: 'rpc-reply', id: message.id, result: await controller.projectFiles() });
        } catch {
          reply({ t: 'rpc-reply', id: message.id, result: controller.projectFilesFallback() });
        }
      })();
      return;
    }
    case 'editorPersonas': {
      reply({ t: 'rpc-reply', id: message.id, result: { names: controller.editorPersonas() } });
      return;
    }
    // Deferred reply: the query spawns and awaits a one-shot ACP session, so the reply fires from
    // editorSuggest's callback, not inline.
    case 'editorSuggest': {
      controller.editorSuggest(message.params, (result) => {
        reply({ t: 'rpc-reply', id: message.id, result });
      });
      return;
    }
    // Fire-and-forget: the connections window relies on the next `state` broadcast to drop the
    // closed row, not on this reply, so `out` is a no-op (an editor tab has no transcript).
    case 'closeEditorConnection': {
      controller.closeEditorConnection(message.params.url, message.params.persona);
      reply({ t: 'rpc-reply', id: message.id, result: 'ok' });
      return;
    }
    default: {
      return;
    }
  }
  reply({ t: 'rpc-reply', id: message.id, result: 'ok' });
}
