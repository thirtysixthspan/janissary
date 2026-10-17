import type { Managers } from '../managers.js';
import type { PluginFailureOrigin } from './failure.js';
import type { TabPluginDeclaration, TabPluginServerCapabilities } from './api.js';
import { ownTabLabel } from './own-tab.js';
import type { HandlerDeadline } from './guard.js';
import { queueEntryLine, queueEntryOrigin } from '../command-queue/entry.js';

export function queueCapabilities(input: {
  managers: Managers;
  declaration: TabPluginDeclaration;
  origin: PluginFailureOrigin;
  answeringLabel?: string;
  isEnabled: () => boolean;
  deadline?: HandlerDeadline;
}): Pick<TabPluginServerCapabilities, 'nextQueuedCommand' | 'dispatchQueuedCommand'> {
  const { managers, declaration, origin, answeringLabel, isEnabled, deadline } = input;
  const owner = () => ownTabLabel({ managers, declaration, origin, answeringLabel },
    'This plugin has no open tab to use its command queue in.');
  return {
    nextQueuedCommand: () => {
      if (!isEnabled()) return null;
      return managers.tab.dequeueCommand(owner(), declaration.id);
    },
    dispatchQueuedCommand: async (receipt, options) => {
      if (!isEnabled()) return { dispatched: false, output: '' };
      const label = owner();
      if (options?.discard === true) {
        managers.tab.discardCommandReceipt(label, declaration.id, receipt);
        return { dispatched: false, output: '' };
      }
      const entry = managers.tab.consumeCommandReceipt(label, declaration.id, receipt);
      const systemSchedule = queueEntryOrigin(entry);
      const dispatch = () => managers.command.dispatchQueuedLine(label, queueEntryLine(entry), systemSchedule);
      return deadline ? deadline.exempt(dispatch) : dispatch();
    },
  };
}
