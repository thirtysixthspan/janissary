import { useState } from 'react';
import { errorText } from '@shared/error-text';
import type { CommandRow, SetIntent } from '@shared/plugins/commands/shared';
import type { TabPluginClientCapabilities } from '../api';
import type { CommandColumn } from './commands-keys';

function settingKey(name: string, setting: CommandColumn): string {
  return `${name}:${setting}`;
}

export function useCommands(capabilities: TabPluginClientCapabilities) {
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [refusal, setRefusal] = useState<string | null>(null);

  const toggle = (row: CommandRow, setting: CommandColumn, value: boolean) => {
    const key = settingKey(row.name, setting);
    const payload: SetIntent = { name: row.name, setting, value };
    setRefusal(null);
    setPending((current) => new Set(current).add(key));
    void capabilities.intent('set', payload)
      .catch((error: unknown) => {
        setRefusal(errorText(error));
      })
      .finally(() => {
        setPending((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
      });
  };

  const isPending = (row: CommandRow, setting: CommandColumn): boolean =>
    pending.has(settingKey(row.name, setting));

  return { isPending, refusal, toggle };
}
