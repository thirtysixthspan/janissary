import type { Controller } from './controller.js';
import type { ServerEvent } from './protocol.js';
import { getConfig } from './config.js';
import { globalCommands } from './global-history.js';
import { listTasks } from './tasks.js';
import { listProfiles } from './profiles.js';

// Full state snapshot sent on `init` and whenever anything changes — shared by index.ts's
// broadcast-driving emitState and message-handler.ts's `init` reply.
export function buildStateEvent(controller: Controller): ServerEvent {
  return {
    t: 'state', tabs: controller.view(), activeTab: controller.managers.tab.activeTab,
    route: controller.routeView(), tabNameMaxLength: getConfig().tabNameMaxLength,
    globalHistory: globalCommands(), syntaxTheme: getConfig().syntaxTheme, theme: getConfig().theme, tasks: listTasks(),
    profiles: listProfiles(), projectDir: controller.rootDir,
  };
}
