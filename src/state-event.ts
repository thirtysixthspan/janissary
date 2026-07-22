import type { Controller } from './controller.js';
import type { ServerEvent } from './protocol.js';
import { getConfig } from './config.js';
import { globalCommands } from './global-history.js';
import { listTasks, janissaryTasksDir } from './tasks.js';
import { listProfiles } from './profiles.js';
import { appVersionNumber } from './cli-args.js';

// Full state snapshot sent on `init` and whenever anything changes — shared by index.ts's
// broadcast-driving emitState and message-handler.ts's `init` reply.
export function buildStateEvent(controller: Controller): ServerEvent {
  return {
    t: 'state', tabs: controller.view(), activeTab: controller.managers.tab.activeTab,
    route: controller.routeView(), harnessLaunch: controller.harnessLaunchView(),
    scheduleLaunch: controller.scheduleLaunchView(),
    tabNameMaxLength: getConfig().tabNameMaxLength,
    activeTabNameMaxLength: getConfig().activeTabNameMaxLength,
    globalHistory: globalCommands(), syntaxTheme: getConfig().syntaxTheme, theme: getConfig().theme,
    tasks: listTasks(controller.rootDir), janissaryTasksDir: janissaryTasksDir(),
    profiles: listProfiles(), projectDir: controller.rootDir, version: appVersionNumber(),
  };
}
