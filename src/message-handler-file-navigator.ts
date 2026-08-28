import type { Controller } from './controller.js';
import type { ClientMessage } from './protocol.js';

type FileNavigatorMessage = Extract<ClientMessage, {
  method: 'fileNavigatorToggle' | 'fileNavigatorCollapseAll'
    | 'fileNavigatorSetDetail' | 'fileNavigatorReroot' | 'moveFileNavigatorItem'
    | 'moveFileNavigatorItems' | 'deleteFileNavigatorItem' | 'deleteFileNavigatorItems'
    | 'renameFileNavigatorItem' | 'fileNavigatorSearch' | 'revealFileNavigatorItem'
    | 'fileNavigatorOpeners' | 'fileNavigatorSelectionAction' | 'runFileNavigatorSelectionAction'
    | 'undoFileNavigatorItem' | 'redoFileNavigatorItem'
    | 'reportFileNavigatorSelection' | 'pasteFileNavigatorItems';
}>;

async function fileNavigatorSearch(controller: Controller, index: number): Promise<unknown> {
  try {
    return { paths: await controller.fileNavigatorSearch(index) };
  } catch {
    return { paths: [] };
  }
}

// The file-navigator RPC cases, split out of the main dispatcher to keep both files focused.
export function dispatchFileNavigatorMessage(controller: Controller, message: FileNavigatorMessage): unknown {
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
      return controller.moveFileNavigatorItems(
        message.params.index,
        message.params.sourcePaths,
        message.params.destinationPath,
        message.params.policy,
      );
    }
    case 'pasteFileNavigatorItems': {
      return controller.pasteFileNavigatorItems(
        message.params.index,
        message.params.sources,
        message.params.destinationPath,
        message.params.mode,
        message.params.policy,
      );
    }
    case 'deleteFileNavigatorItem': { controller.deleteFileNavigatorItem(message.params.index, message.params.relPath); break;
    }
    case 'deleteFileNavigatorItems': {
      return controller.deleteFileNavigatorItems(message.params.index, message.params.paths);
    }
    case 'renameFileNavigatorItem': { controller.renameFileNavigatorItem(message.params.index, message.params.relPath, message.params.newName); break;
    }
    case 'fileNavigatorSearch': {
      return fileNavigatorSearch(controller, message.params.index);
    }
    case 'revealFileNavigatorItem': { controller.revealFileNavigatorItem(message.params.index, message.params.relPath); break;
    }
    // Fire-and-forget: the answer to a `collect-tree-state` request goes straight to the resolver,
    // which discards it if it isn't the request currently in flight.
    case 'reportFileNavigatorSelection': { controller.reportFileNavigatorSelection(message.params.id, message.params.navigators); break;
    }
    case 'fileNavigatorOpeners': {
      return controller.fileNavigatorOpeners(message.params.index, message.params.relPath, message.params.edit, message.params.all);
    }
    case 'fileNavigatorSelectionAction': {
      return controller.fileNavigatorSelectionAction(message.params.index, message.params.paths);
    }
    // Fire-and-forget: what the action produces is the plugin's own tab, not a reply.
    case 'runFileNavigatorSelectionAction': { controller.runFileNavigatorSelectionAction(message.params.index, message.params.paths, message.params.action); break;
    }
    case 'undoFileNavigatorItem': {
      return controller.undoFileNavigatorItem(
        message.params.index,
        message.params.overwrite,
        message.params.skipConflicts,
      );
    }
    case 'redoFileNavigatorItem': {
      return controller.redoFileNavigatorItem(
        message.params.index,
        message.params.overwrite,
        message.params.skipConflicts,
      );
    }
  }
}
