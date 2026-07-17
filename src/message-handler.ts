import type { Controller } from './controller.js';
import type { ClientMessage, ServerEvent } from './protocol.js';
import { buildStateEvent } from './state-event.js';

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
    case 'closeTab': { controller.closeTab(message.params.index); break;
    }
    case 'renameTab': { controller.renameTab(message.params.index, message.params.title); break;
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
    case 'pageSync': { controller.syncPageSnapshot(message.params.url, message.params.text); break;
    }
    case 'fileTreeToggle': { controller.fileTreeToggle(message.params.index, message.params.path); break;
    }
    case 'fileTreeCollapseAll': { controller.fileTreeCollapseAll(message.params.index); break;
    }
    case 'fileTreeReroot': { controller.fileTreeReroot(message.params.index, message.params.path); break;
    }
    case 'moveFileTreeItem': { controller.moveFileTreeItem(message.params.index, message.params.fromRelPath, message.params.toRelPath); break;
    }
    case 'deleteFileTreeItem': { controller.deleteFileTreeItem(message.params.index, message.params.relPath); break;
    }
    case 'undoFileTreeItem': {
      reply({ t: 'rpc-reply', id: message.id, result: controller.undoFileTreeItem(message.params.index, message.params.overwrite) });
      return;
    }
    case 'redoFileTreeItem': {
      reply({ t: 'rpc-reply', id: message.id, result: controller.redoFileTreeItem(message.params.index, message.params.overwrite) });
      return;
    }
    case 'setDock': { controller.setDock(message.params.index, message.params.dock); break;
    }
    case 'openFileNavigatorFor': { controller.openFileNavigatorFor(message.params.label); break;
    }
    case 'launchAgentFor': { controller.launchAgentFor(message.params.label); break;
    }
  }
  reply({ t: 'rpc-reply', id: message.id, result: 'ok' });
}
