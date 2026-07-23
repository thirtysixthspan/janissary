import type { Controller } from './controller.js';
import type { ClientMessage, ServerEvent } from './protocol.js';
import { buildStateEvent } from './state-event.js';
import { openTranscriptFor, openAcpTranscript } from './controller/transcript.js';
import { projectFilesFor } from './project-files.js';
import { handleFileTreeMessage } from './message-handler-file-tree.js';
import { setClientLayout } from './client-layout.js';
import { listPersonas } from './personas.js';
import { editorSuggest, ownerLabel } from './editor-suggest/handler.js';
import { closeConnection } from './connection/close.js';

export function handle(controller: Controller, message: ClientMessage, reply: (event: ServerEvent) => void): void {
  switch (message.method) {
    case 'init': {
      reply(buildStateEvent(controller));
      break;
    }
    case 'command': { controller.dispatch(message.params.text); break;
    }
    case 'setActiveTab': { controller.setActiveTab(message.params.index); break;
    }
    case 'focusTab': {
      controller.managers.tab.setActiveTab(controller.managers.tab.findIndex(message.params.label));
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
    case 'reorderTab': { controller.reorderTab(message.params.dir); break;
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
      if (!controller.managers.questions.answer(message.params.tab, message.params.id, message.params.answer)) {
        throw new Error('question not found');
      }
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
    // Bridges straight to client-layout.js (bypassing a Controller passthrough method) to keep
    // controller.ts under its line-size limit — see openTranscriptFor's comment above.
    case 'reportLayout': { setClientLayout(message.params); break;
    }
    case 'pageSync': { controller.syncPageSnapshot(message.params.url, message.params.text); break;
    }
    case 'fileTreeToggle':
    case 'fileTreeCollapseAll':
    case 'fileTreeReroot':
    case 'moveFileTreeItem':
    case 'deleteFileTreeItem':
    case 'renameFileTreeItem':
    case 'fileTreeSearch':
    case 'revealFileTreeItem':
    case 'fileTreeOpeners':
    case 'undoFileTreeItem':
    case 'redoFileTreeItem': {
      handleFileTreeMessage(controller, message, reply);
      return;
    }
    case 'cancelSchedule': { controller.cancelSchedule(message.params.tab, message.params.id); break;
    }
    case 'clearSchedules': { controller.managers.schedule.clearAll(); break;
    }
    case 'setDock': { controller.setDock(message.params.index, message.params.dock); break;
    }
    case 'openFileNavigatorFor': { controller.openFileNavigatorFor(message.params.label); break;
    }
    case 'launchAgentFor': { controller.launchAgentFor(message.params.label); break;
    }
    // Bridges straight to controller/transcript.js (bypassing a Controller passthrough method)
    // to keep controller.ts under its line-size limit — see that module's own comment.
    case 'openTranscriptFor': { openTranscriptFor(controller.managers, message.params.label); break;
    }
    case 'openAcpTranscript': { openAcpTranscript(controller.managers, message.params.acpRef); break;
    }
    // Deferred reply: the listing is async (never blocks the event loop), so the reply fires from
    // the `.then()`/`.catch()` below, not inline — see project-files.ts and protocol.ts.
    case 'projectFiles': {
      void (async () => {
        try {
          reply({ t: 'rpc-reply', id: message.id, result: await projectFilesFor(controller.managers) });
        } catch {
          reply({ t: 'rpc-reply', id: message.id, result: { root: controller.managers.tab.launchDir, paths: [] } });
        }
      })();
      return;
    }
    // Bridges straight to editor-suggest/handler.js (bypassing a Controller passthrough method)
    // to keep controller.ts under its line-size limit — see openTranscriptFor's comment above.
    case 'editorPersonas': {
      reply({ t: 'rpc-reply', id: message.id, result: { names: listPersonas('editor') } });
      return;
    }
    // Deferred reply: the query spawns and awaits a one-shot ACP session, so the reply fires from
    // editorSuggest's callback, not inline.
    case 'editorSuggest': {
      editorSuggest(controller.managers, message.params, (result) => {
        reply({ t: 'rpc-reply', id: message.id, result });
      });
      return;
    }
    // Fire-and-forget: the connections window relies on the next `state` broadcast to drop the
    // closed row, not on this reply, so `out` is a no-op (an editor tab has no transcript).
    case 'closeEditorConnection': {
      const label = ownerLabel(controller.managers, message.params.url);
      closeConnection('acp', message.params.persona, controller.managers, label, () => { /* no-op */ });
      reply({ t: 'rpc-reply', id: message.id, result: 'ok' });
      return;
    }
  }
  reply({ t: 'rpc-reply', id: message.id, result: 'ok' });
}
