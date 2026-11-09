import {
  defineIntents,
  noFileOpener,
  type TabPluginActivation,
  type TabPluginServerCapabilities,
} from '../api.js';
import { isCommandsPayload, isRefreshIntent, isSetIntent, type SetIntent } from './shared.js';
import { isCommandsData, toPayload } from './payload.js';
import { parseCommand, type CommandParse } from './parse-command.js';

const TOPIC = 'commands';
const INSTANCE_KEY = 'commands';
const TAB_TITLE = 'commands';
const INVALID_DATA = 'invalid commands topic data';

type Edit = Extract<CommandParse, { kind: 'edit' }>;

async function applyEdit(edit: Edit, capabilities: TabPluginServerCapabilities): Promise<void> {
  const refusal = await capabilities.topicAction({
    topic: TOPIC,
    action: 'set',
    name: edit.name,
    setting: edit.setting,
    value: edit.value,
  });
  if (refusal !== undefined) capabilities.rejectRequest(refusal);
}

export function activate(): TabPluginActivation {
  return {
    isPayload: isCommandsPayload,
    opener: noFileOpener('commands'),
    command(argument, capabilities) {
      if (argument.trim().length === 0) {
        capabilities.topicAction({ topic: TOPIC, action: 'refresh' });
        const data = capabilities.topicData(TOPIC);
        if (!isCommandsData(data)) return capabilities.reportFailure(INVALID_DATA);
        capabilities.openOrFocusTab(INSTANCE_KEY, () => ({ title: TAB_TITLE, payload: toPayload(data) }));
        return;
      }
      const data = capabilities.topicData(TOPIC);
      if (!isCommandsData(data)) return capabilities.reportFailure(INVALID_DATA);
      const parsed = parseCommand(argument, data.commands);
      if (parsed.kind === 'error') return capabilities.rejectRequest(parsed.message);
      if (parsed.kind === 'open') return;
      return applyEdit(parsed, capabilities);
    },
    notify(event, capabilities) {
      if (event.topic !== TOPIC) return;
      const { data } = event;
      if (!isCommandsData(data)) return;
      capabilities.updateTab(INSTANCE_KEY, () => ({ payload: toPayload(data) }));
    },
    intent: defineIntents('commands', isCommandsPayload, {
      refresh: {
        payload: isRefreshIntent,
        run: (_tab, _payload: Record<string, never>, capabilities) => {
          capabilities.topicAction({ topic: TOPIC, action: 'refresh' });
          return null;
        },
      },
      set: {
        payload: isSetIntent,
        run: async (_tab, payload: SetIntent, capabilities) => {
          const refusal = await capabilities.topicAction({
            topic: TOPIC,
            action: 'set',
            name: payload.name,
            setting: payload.setting,
            value: payload.value,
          });
          return refusal === undefined ? null : capabilities.rejectRequest(refusal);
        },
      },
    }),
  };
}
