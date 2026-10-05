import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { TabPluginClientCapabilities } from '../api';
import type { ShellDispatchResult } from '@shared/plugins/shell/shared';
import { opensShellHistory, routeFor, shellLine } from './command-line-rules';
import { formatDispatchedCommand } from './format-dispatched-command';
import { markdownToAnsi } from './markdown-to-ansi';
import { appendShellHistory } from './shell-history';

// Runs one command-bar line and answers whether it was written to zsh, which is what tells a
// draining queue to wait for zsh's next prompt before running the line after it. `record` is false
// for a line drained from the queue: it was recorded in the bar's history when it was queued.
export function useShellSubmit(input: {
  appBar: { intercept: (line: string, sourceTab?: string) => boolean };
  capabilities: TabPluginClientCapabilities;
  display: (data: string) => void;
  setMatches: Dispatch<SetStateAction<string[]>>;
  setSent: Dispatch<SetStateAction<string[]>>;
  write: (data: string) => void;
  expectCommand: (line: string) => void;
  openHistory: () => void;
}) {
  const { appBar, capabilities, display, expectCommand, openHistory, setMatches, setSent, write } = input;
  return useCallback(async (text: string, record = true): Promise<boolean> => {
    setMatches([]);
    const remember = (line: string) => { if (record) setSent((previous) => appendShellHistory(previous, line)); };
    const runInShell = (line: string) => {
      expectCommand(line);
      write(`${line}\n`);
    };
    if (routeFor(text) === 'shell') {
      const line = shellLine(text);
      if (!line) return false;
      runInShell(line);
      remember(text);
      return true;
    }
    // Not recorded, so the list it opens is the same one `Ctrl+R` opens rather than one with `hist`
    // newly at the bottom.
    if (opensShellHistory(text)) {
      openHistory();
      return false;
    }
    if (appBar.intercept(text, capabilities.label)) {
      remember(text);
      return false;
    }
    try {
      const result = await capabilities.intent<ShellDispatchResult>('dispatch', text);
      remember(text);
      if (result.dispatched) {
        display(formatDispatchedCommand(text, markdownToAnsi(result.output)));
        return false;
      }
      runInShell(text);
      return true;
    } catch {
      capabilities.reportFailure('shell dispatch intent refused');
      return false;
    }
  }, [appBar, capabilities, display, expectCommand, openHistory, setMatches, setSent, write]);
}
