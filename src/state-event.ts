import type { Controller } from './controller.js';
import type { ServerEvent } from './protocol.js';
import { getConfig } from './config.js';
import { globalCommands } from './global-history.js';
import { listTasks, janissaryTasksDir } from './tasks.js';
import { listProfileRows } from './profiles.js';
import { appVersionNumber } from './cli-args.js';

// Full state snapshot sent on `init` and whenever anything changes — shared by index.ts's
// broadcast-driving emitState and message-handler.ts's `init` reply.
export function buildStateEvent(controller: Controller): ServerEvent {
  const secondaryTab = controller.managers.tab.secondaryTabLabel === undefined
    ? undefined
    : controller.managers.tab.findIndex(controller.managers.tab.secondaryTabLabel);
  return {
    t: 'state', tabs: controller.view(), activeTab: controller.managers.tab.activeTab,
    secondaryTab: secondaryTab === -1 ? undefined : secondaryTab,
    route: controller.routeView(), harnessLaunch: controller.harnessLaunchView(),
    scheduleLaunch: controller.scheduleLaunchView(),
    tabNameMaxLength: getConfig().tabNameMaxLength,
    activeTabNameMaxLength: getConfig().activeTabNameMaxLength,
    globalHistory: globalCommands(), syntaxTheme: getConfig().syntaxTheme, theme: getConfig().theme,
    tasks: listTasks(controller.rootDir), janissaryTasksDir: janissaryTasksDir(),
    profiles: listProfileRows(), projectDir: controller.rootDir, version: appVersionNumber(),
  };
}
