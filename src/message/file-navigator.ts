import type { Controller } from '../controller.js';
import type { ClientMessage, FileNavigatorMutationResults, FileNavigatorRpcCall } from '../protocol.js';
import type { MaybePromise } from '../maybe-promise.js';
import { unhandledClientMethod } from '../client-message.js';

type FileNavigatorMessage = Extract<ClientMessage, {
  method: 'fileNavigatorToggle' | 'fileNavigatorCollapseAll' | 'fileNavigatorPull' | 'fileNavigatorCommit'
    | 'fileNavigatorNothingToCommit'
    | 'fileNavigatorSetDetail' | 'fileNavigatorReroot' | 'moveFileNavigatorItem'
    | 'moveFileNavigatorItems' | 'deleteFileNavigatorItem' | 'deleteFileNavigatorItems'
    | 'renameFileNavigatorItem' | 'fileNavigatorSearch' | 'revealFileNavigatorItem'
    | 'fileNavigatorOpeners' | 'fileNavigatorSelectionAction' | 'runFileNavigatorSelectionAction'
    | 'fileNavigatorOpen' | 'fileNavigatorCreateFile' | 'fileNavigatorCreateDirectory'
    | 'undoFileNavigatorItem' | 'redoFileNavigatorItem'
    | 'reportFileNavigatorSelection' | 'pasteFileNavigatorItems';
}>;

type FileNavigatorMutationMethod = keyof FileNavigatorMutationResults;
type MutationParams<Method extends FileNavigatorMutationMethod> = Extract<
  FileNavigatorRpcCall,
  { method: Method }
>['params'];

export type FileNavigatorMutationHandlers = {
  [Method in FileNavigatorMutationMethod]: (
    controller: Controller,
    params: MutationParams<Method>,
  ) => MaybePromise<FileNavigatorMutationResults[Method]>;
};

const mutationHandlers = {
  moveFileNavigatorItem: (controller, params) => controller.moveFileNavigatorItem(
    params.label, params.fromRelPath, params.toRelPath, params.overwrite,
  ),
  moveFileNavigatorItems: (controller, params) => controller.moveFileNavigatorItems(
    params.label, params.sourcePaths, params.destinationPath, params.policy,
  ),
  pasteFileNavigatorItems: (controller, params) => {
    if (params.sourceHost === undefined) {
      return controller.pasteFileNavigatorItems(
        params.label, params.sources, params.destinationPath, params.mode, params.policy,
      );
    }
    return controller.pasteFileNavigatorItems(
      params.label, params.sources, params.destinationPath, params.mode, params.policy, params.sourceHost,
    );
  },
  renameFileNavigatorItem: (controller, params) => controller.renameFileNavigatorItem(
    params.label, params.relPath, params.newName, params.overwrite,
  ),
  undoFileNavigatorItem: (controller, params) => controller.undoFileNavigatorItem(
    params.label, params.overwrite, params.skipConflicts,
  ),
  redoFileNavigatorItem: (controller, params) => controller.redoFileNavigatorItem(
    params.label, params.overwrite, params.skipConflicts,
  ),
} satisfies FileNavigatorMutationHandlers;

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
    case 'fileNavigatorPull': { controller.fileNavigatorPull(message.params.index); break;
    }
    case 'fileNavigatorCommit': { controller.fileNavigatorCommit(message.params.index, message.params.message, message.params.paths); break;
    }
    case 'fileNavigatorNothingToCommit': { controller.fileNavigatorNothingToCommit(message.params.index); break;
    }
    case 'fileNavigatorSetDetail': { controller.fileNavigatorSetDetail(message.params.index, message.params.details); break;
    }
    case 'fileNavigatorReroot': { controller.fileNavigatorReroot(message.params.index, message.params.path); break;
    }
    case 'moveFileNavigatorItem': {
      return mutationHandlers.moveFileNavigatorItem(controller, message.params);
    }
    case 'moveFileNavigatorItems': {
      return mutationHandlers.moveFileNavigatorItems(controller, message.params);
    }
    case 'pasteFileNavigatorItems': {
      return mutationHandlers.pasteFileNavigatorItems(controller, message.params);
    }
    case 'deleteFileNavigatorItem': {
      return controller.deleteFileNavigatorItem(message.params.label, message.params.relPath);
    }
    case 'deleteFileNavigatorItems': {
      return controller.deleteFileNavigatorItems(message.params.label, message.params.paths);
    }
    case 'renameFileNavigatorItem': {
      return mutationHandlers.renameFileNavigatorItem(controller, message.params);
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
      return controller.fileNavigatorCreateFile(message.params.label, message.params.destination);
    }
    case 'fileNavigatorCreateDirectory': {
      return controller.fileNavigatorCreateDirectory(message.params.label, message.params.destination);
    }
    case 'fileNavigatorSelectionAction': {
      return controller.fileNavigatorSelectionAction(message.params.index, message.params.paths);
    }
    // Fire-and-forget: what the action produces is the plugin's own tab, not a reply.
    case 'runFileNavigatorSelectionAction': { controller.runFileNavigatorSelectionAction(message.params.index, message.params.paths, message.params.action); break;
    }
    case 'undoFileNavigatorItem': {
      return mutationHandlers.undoFileNavigatorItem(controller, message.params);
    }
    case 'redoFileNavigatorItem': {
      return mutationHandlers.redoFileNavigatorItem(controller, message.params);
    }
    default: { return unhandledClientMethod(message);
    }
  }
}
