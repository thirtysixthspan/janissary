import type { Controller } from './controller.js';
import type { ClientMessage, ServerEvent } from './protocol.js';
import { fileNavigatorSearch, revealFileNavigatorItem, renameFileNavigatorItem, fileNavigatorOpeners } from './controller/file-navigator.js';

type FileNavigatorMessage = Extract<ClientMessage, {
  method: 'fileNavigatorToggle' | 'fileNavigatorCollapseAll' | 'fileNavigatorReroot' | 'moveFileNavigatorItem'
    | 'deleteFileNavigatorItem' | 'renameFileNavigatorItem' | 'fileNavigatorSearch' | 'revealFileNavigatorItem' | 'fileNavigatorOpeners' | 'undoFileNavigatorItem' | 'redoFileNavigatorItem';
}>;

// The file-navigator RPC cases, split out of `handle()` to keep message-handler.ts under the line-size
// limit — mirrors why controller/file-navigator.ts was split out of controller.ts.
export function handleFileNavigatorMessage(controller: Controller, message: FileNavigatorMessage, reply: (event: ServerEvent) => void): void {
  switch (message.method) {
    case 'fileNavigatorToggle': { controller.fileNavigatorToggle(message.params.index, message.params.path); break;
    }
    case 'fileNavigatorCollapseAll': { controller.fileNavigatorCollapseAll(message.params.index); break;
    }
    case 'fileNavigatorReroot': { controller.fileNavigatorReroot(message.params.index, message.params.path); break;
    }
    case 'moveFileNavigatorItem': { controller.moveFileNavigatorItem(message.params.index, message.params.fromRelPath, message.params.toRelPath); break;
    }
    case 'deleteFileNavigatorItem': { controller.deleteFileNavigatorItem(message.params.index, message.params.relPath); break;
    }
    case 'renameFileNavigatorItem': { renameFileNavigatorItem(controller.managers, message.params.index, message.params.relPath, message.params.newName); break;
    }
    // Deferred reply: the listing is async (never blocks the event loop) — see fileNavigatorSearch
    // in controller/file-navigator.ts and the `projectFiles` case in message-handler.ts for the same
    // pattern.
    case 'fileNavigatorSearch': {
      void (async () => {
        try {
          reply({ t: 'rpc-reply', id: message.id, result: { paths: await fileNavigatorSearch(controller.managers, message.params.index) } });
        } catch {
          reply({ t: 'rpc-reply', id: message.id, result: { paths: [] } });
        }
      })();
      return;
    }
    case 'revealFileNavigatorItem': { revealFileNavigatorItem(controller.managers, message.params.index, message.params.relPath); break;
    }
    case 'fileNavigatorOpeners': {
      reply({ t: 'rpc-reply', id: message.id, result: fileNavigatorOpeners(controller.managers, message.params.index, message.params.relPath, message.params.edit) });
      return;
    }
    case 'undoFileNavigatorItem': {
      reply({ t: 'rpc-reply', id: message.id, result: controller.undoFileNavigatorItem(message.params.index, message.params.overwrite) });
      return;
    }
    case 'redoFileNavigatorItem': {
      reply({ t: 'rpc-reply', id: message.id, result: controller.redoFileNavigatorItem(message.params.index, message.params.overwrite) });
      return;
    }
  }
  reply({ t: 'rpc-reply', id: message.id, result: 'ok' });
}
