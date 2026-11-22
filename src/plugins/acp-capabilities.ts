import type { Managers } from '../managers.js';
import type { HandlerDeadline } from './guard.js';
import type { PluginFailureOrigin } from './failure.js';
import { TabPluginRejection } from './api-capabilities.js';
import type { TabPluginDeclaration, TabPluginServerCapabilities } from './api.js';
import { ownTabLabel } from './own-tab.js';
import type { AcpRole } from '../acp/role.js';
import { DEFAULT_ACP_ROLE } from '../acp/role.js';
import { knownRoleSettings, noRoleModels } from '../acp/ask-role.js';
import { noEnabledModelsNotice, unknownRoleNotice } from '../acp/persona-role.js';
import { notify } from '../notifications/index.js';

const ROLE_PERSONA = 'summarizer';

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
  // The role established by `startAcp` is the one `promptAcpResult` prompts under, so the connection
  // and the prompt cannot drift to different roles. Defaults to `ask` for callers that name none.
  let role: string = DEFAULT_ACP_ROLE;
  return {
    startAcp: (request) => {
      if (request?.role !== undefined) role = request.role;
      const label = ownLabel();
      const started = managers.acp.start(label, request, role);
      if (request?.role !== undefined && started.error === noRoleModels(role as AcpRole)) {
        const message = knownRoleSettings(managers.tab.launchDir, role)
          ? noEnabledModelsNotice(ROLE_PERSONA, role)
          : unknownRoleNotice(ROLE_PERSONA, role);
        notify(managers, 'manual', label, message);
        return { error: message };
      }
      return started;
    },
    promptAcp: (prompt) => {
      const label = ownLabel();
      const run = () => managers.acp.prompt(label, `ask ${prompt}`);
      return deadline ? deadline.exempt(run) : run();
    },
    promptAcpResult: (prompt) => {
      const label = ownLabel();
      const run = () => managers.acp.promptResult(label, prompt, role);
      return deadline ? deadline.exempt(run) : run();
    },
    resetAcp: () => managers.acp.close(ownLabel()),
  };
}
