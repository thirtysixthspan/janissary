import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { TabPluginClientCapabilities } from '../api';
import type { ShellDispatchResult } from '@shared/plugins/shell/shared';
import { routeFor, shellLine } from './command-line-rules';
import { recordShellCommand } from './record-shell-command';
import { formatDispatchedCommand } from './format-dispatched-command';

export function useShellSubmit(input: {
  appBar: { intercept: (line: string, sourceTab?: string) => boolean };
  capabilities: TabPluginClientCapabilities;
  display: (data: string) => void;
  setMatches: Dispatch<SetStateAction<string[]>>;
  setSent: Dispatch<SetStateAction<string[]>>;
  write: (data: string) => void;
}) {
  const { appBar, capabilities, display, setMatches, setSent, write } = input;
  return useCallback((text: string) => {
    setMatches([]);
    if (routeFor(text) === 'shell') {
      const line = shellLine(text);
      if (!line) return;
      write(`${line}\n`);
      setSent((previous) => [...previous, text]);
      return;
    }
    if (recordShellCommand(text, appBar.intercept(text, capabilities.label), setSent)) return;
    void capabilities.intent<ShellDispatchResult>('dispatch', text)
      .then((result) => {
        if (recordShellCommand(text, result.dispatched, setSent)) {
          display(formatDispatchedCommand(text, result.output));
          return;
        }
        write(`${text}\n`);
        setSent((previous) => [...previous, text]);
      })
      .catch(() => { capabilities.reportFailure('shell dispatch intent refused'); });
  }, [appBar, capabilities, display, setMatches, setSent, write]);
}
