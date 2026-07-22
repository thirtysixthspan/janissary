import type { Controller } from './controller.js';
import type { ClientMessage, ServerEvent } from './protocol.js';
import { fileTreeSearch, revealFileTreeItem, renameFileTreeItem } from './controller/file-tree.js';

type FileTreeMessage = Extract<ClientMessage, {
  method: 'fileTreeToggle' | 'fileTreeCollapseAll' | 'fileTreeReroot' | 'moveFileTreeItem'
    | 'deleteFileTreeItem' | 'renameFileTreeItem' | 'fileTreeSearch' | 'revealFileTreeItem' | 'undoFileTreeItem' | 'redoFileTreeItem';
}>;

// The file-tree RPC cases, split out of `handle()` to keep message-handler.ts under the line-size
// limit — mirrors why controller-file-tree.ts was split out of controller.ts.
export function handleFileTreeMessage(controller: Controller, message: FileTreeMessage, reply: (event: ServerEvent) => void): void {
  switch (message.method) {
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
    case 'renameFileTreeItem': { renameFileTreeItem(controller.managers, message.params.index, message.params.relPath, message.params.newName); break;
    }
    // Deferred reply: the listing is async (never blocks the event loop) — see fileTreeSearch
    // in controller/file-tree.ts and the `projectFiles` case in message-handler.ts for the same
    // pattern.
    case 'fileTreeSearch': {
      void (async () => {
        try {
          reply({ t: 'rpc-reply', id: message.id, result: { paths: await fileTreeSearch(controller.managers, message.params.index) } });
        } catch {
          reply({ t: 'rpc-reply', id: message.id, result: { paths: [] } });
        }
      })();
      return;
    }
    case 'revealFileTreeItem': { revealFileTreeItem(controller.managers, message.params.index, message.params.relPath); break;
    }
    case 'undoFileTreeItem': {
      reply({ t: 'rpc-reply', id: message.id, result: controller.undoFileTreeItem(message.params.index, message.params.overwrite) });
      return;
    }
    case 'redoFileTreeItem': {
      reply({ t: 'rpc-reply', id: message.id, result: controller.redoFileTreeItem(message.params.index, message.params.overwrite) });
      return;
    }
  }
  reply({ t: 'rpc-reply', id: message.id, result: 'ok' });
}
