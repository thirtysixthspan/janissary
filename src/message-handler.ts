import type { Controller } from './controller.js';
import type { ClientMessage, ServerEvent } from './protocol.js';
import { getConfig } from './config.js';
import { globalCommands } from './global-history.js';

export function handle(controller: Controller, message: ClientMessage, reply: (event: ServerEvent) => void): void {
  switch (message.method) {
    case 'init': {
      reply({
        t: 'state', tabs: controller.view(), activeTab: controller.managers.tab.activeTab,
        route: controller.routeView(), tabNameMaxLength: getConfig().tabNameMaxLength,
        globalHistory: globalCommands(), syntaxTheme: getConfig().syntaxTheme,
      });
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
    case 'moveTab': { controller.moveTab(message.params.dir); break;
    }
    case 'reorderTab': { controller.reorderTab(message.params.dir); break;
    }
    case 'toggleCollapse': { controller.toggleCollapse(); break;
    }
    case 'chooseRoute': { controller.chooseRoute(message.params.index); break;
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
    case 'saveFile': { controller.saveFile(message.params.url, message.params.content); break;
    }
    case 'fileTreeToggle': { controller.fileTreeToggle(message.params.index, message.params.path); break;
    }
    case 'fileTreeCollapseAll': { controller.fileTreeCollapseAll(message.params.index); break;
    }
    case 'fileTreeReroot': { controller.fileTreeReroot(message.params.index); break;
    }
  }
  reply({ t: 'rpc-reply', id: message.id, result: 'ok' });
}
