import type { Controller } from '../controller.js';
import type { ClientMessage } from '../protocol.js';
import { unhandledClientMethod } from '../client-message.js';

type TabMessage = Extract<ClientMessage, {
  method: 'command' | 'setActiveTab' | 'focusTab' | 'closeTab' | 'renameTab' | 'promoteToTerminal'
    | 'editQueuedCommand' | 'deleteQueuedCommand' | 'moveTab' | 'moveTabToOtherPane'
    | 'reorderTab' | 'reorderTabTo' | 'toggleCollapse' | 'revealNotifications' | 'chooseRoute'
    | 'setDock' | 'openFileNavigatorFor' | 'launchAgentFor' | 'openTranscriptFor'
    | 'openHarnessTranscriptFor' | 'openAcpTranscript';
}>;

// The tab-tree RPC cases, split out of the main dispatcher to keep both files focused: these act on
// the tab strip itself — which tab is active, where it sits, what it is called, and which tab a
// launch or a transcript opens — and have nothing to do with the pty, editor, plugin and
// file-navigator cases the dispatcher's other arms handle.
export function dispatchTabMessage(controller: Controller, message: TabMessage): unknown {
  switch (message.method) {
    case 'command': { controller.dispatch(message.params.text); break;
    }
    case 'setActiveTab': { controller.setActiveTab(message.params.index); break;
    }
    case 'focusTab': { controller.focusTab(message.params.label); break;
    }
    case 'closeTab': { controller.closeTab(message.params.index); break;
    }
    case 'renameTab': { controller.renameTab(message.params.index, message.params.title); break;
    }
    case 'promoteToTerminal': { controller.promoteToTerminal(); break;
    }
    case 'editQueuedCommand': { controller.editQueuedCommand(message.params.index, message.params.text); break;
    }
    case 'deleteQueuedCommand': { controller.deleteQueuedCommand(message.params.index); break;
    }
    case 'moveTab': { controller.moveTab(message.params.dir); break;
    }
    case 'moveTabToOtherPane': { controller.moveTabToOtherPane(message.params.index); break;
    }
    case 'reorderTab': { controller.reorderTab(message.params.dir); break;
    }
    case 'reorderTabTo': { controller.reorderTabTo(message.params.from, message.params.to); break;
    }
    case 'toggleCollapse': { controller.toggleCollapse(); break;
    }
    case 'revealNotifications': { controller.revealNotifications(); break;
    }
    case 'chooseRoute': { controller.chooseRoute(message.params.index); break;
    }
    case 'setDock': { controller.setDock(message.params.index, message.params.dock); break;
    }
    case 'openFileNavigatorFor': { controller.openFileNavigatorFor(message.params.label); break;
    }
    case 'launchAgentFor': { controller.launchAgentFor(message.params.label); break;
    }
    case 'openTranscriptFor': { controller.openTranscriptFor(message.params.label); break;
    }
    case 'openHarnessTranscriptFor': { controller.openHarnessTranscriptFor(message.params.label); break;
    }
    case 'openAcpTranscript': { controller.openAcpTranscript(message.params.acpRef); break;
    }
    default: { return unhandledClientMethod(message);
    }
  }
}
