import type { Managers } from '../managers.js';
import type { HandlerDeadline } from './guard.js';
import type { PluginFailureOrigin } from './failure.js';
import { TabPluginRejection } from './api-capabilities.js';
import type { TabPluginDeclaration, TabPluginServerCapabilities } from './api.js';
import { ownTabLabel } from './own-tab.js';

export function acpCapabilities(input: {
  managers: Managers;
  declaration: TabPluginDeclaration;
  origin: PluginFailureOrigin;
  answeringLabel?: string;
  isEnabled: () => boolean;
  deadline?: HandlerDeadline;
}): Pick<TabPluginServerCapabilities, 'startAcp' | 'promptAcp' | 'promptAcpResult' | 'resetAcp'> {
  const { managers, declaration, origin, answeringLabel, isEnabled, deadline } = input;
  // The same ownership answer the line capabilities get, from the same predicate: this plugin's own
  // tab, or a rejection. A disabled plugin is its own question, asked first.
  const ownLabel = () => {
    if (!isEnabled()) throw new TabPluginRejection('ACP tab is unavailable.');
    return ownTabLabel({ managers, declaration, origin, answeringLabel }, 'ACP tab is unavailable.');
  };
  return {
    startAcp: (request) => managers.acp.start(ownLabel(), request),
    promptAcp: (prompt) => {
      const label = ownLabel();
      const run = () => managers.acp.prompt(label, `acp ${prompt}`);
      return deadline ? deadline.exempt(run) : run();
    },
    promptAcpResult: (prompt) => {
      const label = ownLabel();
      const run = () => managers.acp.promptResult(label, `acp ${prompt}`);
      return deadline ? deadline.exempt(run) : run();
    },
    resetAcp: () => managers.acp.close(ownLabel()),
  };
}
