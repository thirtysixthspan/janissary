import type { TabPluginClientCapabilities } from '../api';
import type { LauncherDispatchReply } from '@shared/plugins/launcher/shared';

// What a launcher command-bar line needs from the application's own bar: the one question it asks
// before sending anything anywhere. Everything else the launcher's bar does is the published baseline
// keymap.
type AppBar = { intercept: (line: string) => boolean };

// A line typed into the launcher's own command bar. The path is the one the shell tab's takes, because
// it is the right order for any tab that hosts the application's own bar:
//
// 1. the application's interception answers it — a picker, the queue, a quit confirmation — and
//    nothing is sent at all;
// 2. otherwise the launcher dispatches it as an application command through the intent that wraps
//    `dispatchLineWithOutput`, and answers back what the command produced;
// 3. a line the dispatcher did not recognise is not written to a shell, because the launcher has no
//    shell. It is reported as one the application did not claim.
export function useLauncherSubmit(input: {
  appBar: AppBar;
  capabilities: TabPluginClientCapabilities;
  onReply: (text: string | null) => void;
  clear: () => void;
}): (text: string) => void {
  const { appBar, capabilities, onReply, clear } = input;
  // The lines this tab has sent, oldest first, so ArrowUp and ArrowDown recall them the way every other
  // bar in the application does. The launcher is one tab and one bar, so its own list is its whole
  // history.
  const sent: string[] = [];
  return (text: string) => {
    const line = text.trim();
    if (!line) return;
    clear();
    sent.push(line);
    // The application answers first: a picker, the queue, a quit confirmation. Nothing reaches the
    // server, exactly as nothing would if this had been typed into a shell tab's own bar.
    if (appBar.intercept(line)) return;
    void capabilities.intent<LauncherDispatchReply>('dispatch', { line })
      .then((reply) => {
        if (!reply.dispatched) onReply(`No application command matches "${line}".`);
        // A `coreResponse` is one the application rendered itself, so repeating its text here would
        // show the same answer twice.
        else if (reply.coreResponse || !reply.output) onReply(null);
        else onReply(reply.output);
      })
      .catch(() => { onReply(null); });
  };
}
