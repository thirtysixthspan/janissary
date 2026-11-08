import type { Managers } from '../managers.js';
import type { Subscription } from '../bus.js';
import { resolveApplicationCommand } from '../application-commands.js';
import type { CommandsTopicAction, CommandsTopicNotification } from './api-topics-commands.js';

export function readCommandsTopic(managers: Managers): CommandsTopicNotification['data'] {
  return managers.nativeCommandSettings.current();
}

async function setCommand(
  managers: Managers, action: Extract<CommandsTopicAction, { action: 'set' }>,
): Promise<string | undefined> {
  const setting = action.setting === 'enabled'
    ? { enabled: action.value }
    : { agentAccess: action.value };
  const result = await managers.nativeCommandSettings.edit({ name: action.name, setting });
  return result.ok ? undefined : result.message;
}

export function runCommandsTopicAction(
  managers: Managers, action: CommandsTopicAction,
): string | undefined | Promise<string | undefined> {
  switch (action.action) {
    case 'refresh': { managers.nativeCommandSettings.refresh(); return; }
    case 'set': {
      const resolved = resolveApplicationCommand(action.name);
      if (resolved && action.setting === 'agentAccess' && resolved.nativeTool === undefined) {
        return Promise.resolve(`Not a native ACP command: ${resolved.name}.`);
      }
      return setCommand(managers, action);
    }
  }
}

export function subscribeCommandsTopic(managers: Managers, fire: () => void): Subscription {
  return { unsubscribe: managers.nativeCommandSettings.subscribe(() => { fire(); }) };
}
