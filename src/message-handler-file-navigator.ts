import type { Controller } from './controller.js';
import type { ClientMessage, ServerEvent } from './protocol.js';

type FileNavigatorMessage = Extract<ClientMessage, {
  method: 'fileNavigatorToggle' | 'fileNavigatorCollapseAll'
    | 'fileNavigatorSetDetail' | 'fileNavigatorReroot' | 'moveFileNavigatorItem'
    | 'moveFileNavigatorItems' | 'deleteFileNavigatorItem' | 'deleteFileNavigatorItems'
    | 'renameFileNavigatorItem' | 'fileNavigatorSearch' | 'revealFileNavigatorItem'
    | 'fileNavigatorOpeners' | 'fileNavigatorSelectionAction' | 'runFileNavigatorSelectionAction'
    | 'undoFileNavigatorItem' | 'redoFileNavigatorItem'
    | 'reportFileNavigatorSelection' | 'pasteFileNavigatorItems';
}>;

// The file-navigator RPC cases, split out of `handle()` to keep message-handler.ts under the line-size
// limit — mirrors why controller/file-navigator.ts was split out of controller.ts.
export function handleFileNavigatorMessage(controller: Controller, message: FileNavigatorMessage, reply: (event: ServerEvent) => void): void {
  switch (message.method) {
    case 'fileNavigatorToggle': { controller.fileNavigatorToggle(message.params.index, message.params.path); break;
    }
    case 'fileNavigatorCollapseAll': { controller.fileNavigatorCollapseAll(message.params.index); break;
    }
    case 'fileNavigatorSetDetail': { controller.fileNavigatorSetDetail(message.params.index, message.params.details); break;
    }
    case 'fileNavigatorReroot': { controller.fileNavigatorReroot(message.params.index, message.params.path); break;
    }
    case 'moveFileNavigatorItem': { controller.moveFileNavigatorItem(message.params.index, message.params.fromRelPath, message.params.toRelPath); break;
    }
    case 'moveFileNavigatorItems': {
      reply({
        t: 'rpc-reply',
        id: message.id,
        result: controller.moveFileNavigatorItems(
          message.params.index,
          message.params.sourcePaths,
          message.params.destinationPath,
          message.params.policy,
        ),
      });
      return;
    }
    case 'pasteFileNavigatorItems': {
      reply({
        t: 'rpc-reply',
        id: message.id,
        result: controller.pasteFileNavigatorItems(
          message.params.index,
          message.params.sources,
          message.params.destinationPath,
          message.params.mode,
          message.params.policy,
        ),
      });
      return;
    }
    case 'deleteFileNavigatorItem': { controller.deleteFileNavigatorItem(message.params.index, message.params.relPath); break;
    }
    case 'deleteFileNavigatorItems': {
      reply({
        t: 'rpc-reply',
        id: message.id,
        result: controller.deleteFileNavigatorItems(message.params.index, message.params.paths),
      });
      return;
    }
    case 'renameFileNavigatorItem': { controller.renameFileNavigatorItem(message.params.index, message.params.relPath, message.params.newName); break;
    }
    // Deferred reply: the listing is async (never blocks the event loop) — see fileNavigatorSearch
    // in controller/file-navigator.ts and the `projectFiles` case in message-handler.ts for the same
    // pattern.
    case 'fileNavigatorSearch': {
      void (async () => {
        try {
          reply({ t: 'rpc-reply', id: message.id, result: { paths: await controller.fileNavigatorSearch(message.params.index) } });
        } catch {
          reply({ t: 'rpc-reply', id: message.id, result: { paths: [] } });
        }
      })();
      return;
    }
    case 'revealFileNavigatorItem': { controller.revealFileNavigatorItem(message.params.index, message.params.relPath); break;
    }
    // Fire-and-forget: the answer to a `collect-tree-state` request goes straight to the resolver,
    // which discards it if it isn't the request currently in flight.
    case 'reportFileNavigatorSelection': { controller.reportFileNavigatorSelection(message.params.id, message.params.navigators); break;
    }
    case 'fileNavigatorOpeners': {
      reply({ t: 'rpc-reply', id: message.id, result: controller.fileNavigatorOpeners(message.params.index, message.params.relPath, message.params.edit, message.params.all) });
      return;
    }
    case 'fileNavigatorSelectionAction': {
      reply({ t: 'rpc-reply', id: message.id, result: controller.fileNavigatorSelectionAction(message.params.index, message.params.paths) });
      return;
    }
    // Fire-and-forget: what the action produces is the plugin's own tab, not a reply.
    case 'runFileNavigatorSelectionAction': { controller.runFileNavigatorSelectionAction(message.params.index, message.params.paths, message.params.action); break;
    }
    case 'undoFileNavigatorItem': {
      reply({
        t: 'rpc-reply',
        id: message.id,
        result: controller.undoFileNavigatorItem(
          message.params.index,
          message.params.overwrite,
          message.params.skipConflicts,
        ),
      });
      return;
    }
    case 'redoFileNavigatorItem': {
      reply({
        t: 'rpc-reply',
        id: message.id,
        result: controller.redoFileNavigatorItem(
          message.params.index,
          message.params.overwrite,
          message.params.skipConflicts,
        ),
      });
      return;
    }
  }
  reply({ t: 'rpc-reply', id: message.id, result: 'ok' });
}
