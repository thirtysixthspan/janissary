import type { Controller } from './controller.js';
import type { ClientMessage } from './protocol.js';
import { isEditorPluginFailedParams, isPluginFailedParams, isPluginIntentParams } from './client-message.js';

type PluginMessage = Extract<ClientMessage, {
  method: 'defaultMenuSelectionAction' | 'runDefaultMenuSelectionAction'
    | 'pluginIntent' | 'pluginFailed' | 'editorPluginFailed';
}>;

// The tab-plugin RPC cases, split out of the main dispatcher to keep both files focused: these route
// to whichever bundled plugin owns the record the server resolved, and have nothing to do with the
// tab-tree cases the dispatcher's other arms handle.
export function dispatchPluginMessage(controller: Controller, message: PluginMessage): unknown {
  switch (message.method) {
    case 'defaultMenuSelectionAction': {
      return controller.defaultMenuSelectionAction();
    }
    case 'runDefaultMenuSelectionAction': {
      controller.runDefaultMenuSelectionAction(message.params.selection, message.params.action);
      break;
    }
    case 'pluginIntent': {
      if (!isPluginIntentParams(message.params)) throw new Error('Invalid pluginIntent params');
      return controller.pluginIntent(
        message.params.tab,
        message.params.intent,
        message.params.payload,
      );
    }
    case 'pluginFailed': {
      if (!isPluginFailedParams(message.params)) throw new Error('Invalid pluginFailed params');
      controller.pluginFailed(message.params.tab, message.params.reason);
      break;
    }
    case 'editorPluginFailed': {
      if (!isEditorPluginFailedParams(message.params)) {
        throw new Error('Invalid editorPluginFailed params');
      }
      controller.editorPluginFailed(
        message.params.url, message.params.plugin, message.params.reason,
      );
      break;
    }
  }
}
