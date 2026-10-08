import type { Managers } from '../managers.js';
import type { HandlerDeadline } from './guard.js';
import type { PluginFailureOrigin } from './failure.js';
import { TabPluginRejection } from './api-capabilities.js';
import type { TabPluginDeclaration, TabPluginServerCapabilities } from './api.js';

export function acpCapabilities(input: {
  managers: Managers;
  declaration: TabPluginDeclaration;
  origin: PluginFailureOrigin;
  answeringLabel?: string;
  isEnabled: () => boolean;
  deadline?: HandlerDeadline;
}): Pick<TabPluginServerCapabilities, 'startAcp' | 'promptAcp' | 'resetAcp'> {
  const { managers, declaration, origin, answeringLabel, isEnabled, deadline } = input;
  const ownLabel = () => {
    const label = answeringLabel ?? origin.label;
    const tab = managers.tab.byLabel(label);
    if (!isEnabled() || tab?.view !== 'plugin' || tab.plugin?.id !== declaration.id) {
      throw new TabPluginRejection('ACP tab is unavailable.');
    }
    return label;
  };
  return {
    startAcp: () => managers.acp.start(ownLabel()),
    promptAcp: (prompt) => {
      const label = ownLabel();
      const run = () => managers.acp.prompt(label, `acp ${prompt}`);
      return deadline ? deadline.exempt(run) : run();
    },
    resetAcp: () => managers.acp.close(ownLabel()),
  };
}
