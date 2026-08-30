import type { Controller } from './controller.js';
import type { ClientMessage } from './protocol.js';

type FileNavigatorMessage = Extract<ClientMessage, {
  method: 'fileNavigatorToggle' | 'fileNavigatorCollapseAll'
    | 'fileNavigatorSetDetail' | 'fileNavigatorReroot' | 'moveFileNavigatorItem'
    | 'moveFileNavigatorItems' | 'deleteFileNavigatorItem' | 'deleteFileNavigatorItems'
    | 'renameFileNavigatorItem' | 'fileNavigatorSearch' | 'revealFileNavigatorItem'
    | 'fileNavigatorOpeners' | 'fileNavigatorSelectionAction' | 'runFileNavigatorSelectionAction'
    | 'fileNavigatorOpen' | 'fileNavigatorCreateFile' | 'fileNavigatorCreateDirectory'
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
    case 'moveFileNavigatorItem': {
      return controller.moveFileNavigatorItem(message.params.index, message.params.fromRelPath, message.params.toRelPath);
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
      if (message.params.sourceHost === undefined) {
        return controller.pasteFileNavigatorItems(
          message.params.index, message.params.sources, message.params.destinationPath,
          message.params.mode, message.params.policy,
        );
      }
      return controller.pasteFileNavigatorItems(
        message.params.index,
        message.params.sources,
        message.params.destinationPath,
        message.params.mode,
        message.params.policy,
        message.params.sourceHost,
      );
    }
    case 'deleteFileNavigatorItem': {
      return controller.deleteFileNavigatorItem(message.params.index, message.params.relPath);
    }
    case 'deleteFileNavigatorItems': {
      return controller.deleteFileNavigatorItems(message.params.index, message.params.paths);
    }
    case 'renameFileNavigatorItem': {
      return controller.renameFileNavigatorItem(message.params.index, message.params.relPath, message.params.newName);
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
    case 'fileNavigatorOpen': {
      return controller.fileNavigatorOpen(
        message.params.index, message.params.relPath, message.params.command,
      );
    }
    case 'fileNavigatorCreateFile': {
      return controller.fileNavigatorCreateFile(message.params.index, message.params.destination);
    }
    case 'fileNavigatorCreateDirectory': {
      return controller.fileNavigatorCreateDirectory(message.params.index, message.params.destination);
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
