import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { TabPluginClientCapabilities } from '../api';
import { isShellAcpReceipt } from '@shared/plugins/shell/shared';
import type { ShellAcpReceipt, ShellDispatchResult } from '@shared/plugins/shell/shared';
import { opensShellHistory, routeFor, shellLine, transcriptSearchQuery } from './command-line-rules';
import { appendShellHistory } from './shell-history';
import { shellCommandInput } from './shell-command-input';
import { stripTerminalControls } from './strip-terminal-controls';
import { reportShellIntentFailure } from './report-shell-intent-failure';

// Runs one command-bar line and answers whether it was written to zsh, which is what tells a
// draining queue to wait for zsh's next prompt before running the line after it. `record` is false
// for a line drained from the queue: it was recorded in the bar's history when it was queued.
export function useShellSubmit(input: {
  appBar: { intercept: (line: string) => boolean };
  capabilities: TabPluginClientCapabilities;
  displayReply: (line: string, markdown: string) => void;
  echoCommand: (line: string, receipt?: ShellAcpReceipt) => void;
  setMatches: Dispatch<SetStateAction<string[]>>;
  setSent: Dispatch<SetStateAction<string[]>>;
  write: (data: string) => void;
  expectCommand: (line: string) => void;
  openHistory: () => void;
  openFind: (query: string) => void;
}) {
  const { appBar, capabilities, displayReply, echoCommand, expectCommand, openFind, openHistory, setMatches, setSent, write } = input;
  return useCallback(async (text: string, record = true, receipt?: string): Promise<boolean> => {
    setMatches([]);
    // A line the bar records in its own history enters the application's global history too, which
    // is what ghost text completes from in every tab.
    const remember = (line: string) => {
      if (!record) return;
      setSent((previous) => appendShellHistory(previous, line));
      void capabilities.intent('remember', line).catch(() => {});
    };
    const runInShell = (line: string) => {
      const command = stripTerminalControls(line);
      expectCommand(command);
      write(shellCommandInput(command));
    };
    const discard = async () => {
      if (receipt) await capabilities.intent('dispatch-command', { receipt, discard: true });
    };
    if (routeFor(text) === 'shell') {
      const line = shellLine(text);
      if (!line) {
        await discard();
        return false;
      }
      await discard();
      runInShell(line);
      remember(text);
      return true;
    }
    // Not recorded, so the list it opens is the same one `Ctrl+R` opens rather than one with `hist`
    // newly at the bottom.
    if (opensShellHistory(text)) {
      await discard();
      openHistory();
      return false;
    }
    const findQuery = transcriptSearchQuery(text);
    if (findQuery !== undefined) {
      await discard();
      remember(text);
      openFind(findQuery);
      return false;
    }
    if (appBar.intercept(text)) {
      await discard();
      remember(text);
      return false;
    }
    try {
      const result = receipt
        ? await capabilities.intent<ShellDispatchResult>('dispatch-command', { receipt })
        : await capabilities.intent<ShellDispatchResult>('dispatch', text);
      remember(text);
      if (result.dispatched) {
        // A core-response command answers later, beneath this echo of its line.
        if (result.coreResponse) {
          const acpReceipt = isShellAcpReceipt(result.result) ? result.result : undefined;
          echoCommand(text, acpReceipt);
        }
        else displayReply(text, result.output);
        return false;
      }
      runInShell(text);
      return true;
    } catch (error: unknown) {
      await discard();
      reportShellIntentFailure(capabilities, 'shell dispatch intent refused', error);
      return false;
    }
  }, [appBar, capabilities, displayReply, echoCommand, expectCommand, openFind, openHistory, setMatches, setSent, write]);
}
