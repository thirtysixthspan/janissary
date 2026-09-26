import type { Controller } from '../controller.js';
import type { ClientMessage } from '../protocol.js';
import { unhandledClientMethod } from '../client-message.js';

type EditorMessage = Extract<ClientMessage, {
  method: 'editorSync' | 'resyncEditorTab' | 'renameEditorFile' | 'commitEditorFile'
    | 'editorPersonas' | 'editorSuggest' | 'closeEditorConnection';
}>;

// The editor RPC cases, split out of the main dispatcher to keep both files focused: these act on
// one editor tab's buffer, its file on disk, and the personas and completion its pane offers, and
// have nothing to do with the tab-tree, pty, plugin and file-navigator cases the dispatcher's other
// arms handle.
export function dispatchEditorMessage(controller: Controller, message: EditorMessage): unknown {
  switch (message.method) {
    case 'editorSync': { controller.syncEditorBuffer(message.params.url, message.params.content); break;
    }
    case 'resyncEditorTab': { controller.resyncEditorTab(message.params.url); break;
    }
    case 'renameEditorFile': { controller.renameEditorFile(message.params.url, message.params.name); break;
    }
    case 'commitEditorFile': { controller.commitEditorFile(message.params.url, message.params.message); break;
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
    default: { return unhandledClientMethod(message);
    }
  }
}
