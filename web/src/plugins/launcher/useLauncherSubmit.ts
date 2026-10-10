import type { TabPluginClientCapabilities } from '../api';
import type { LauncherCommand, LauncherDispatchReply } from '@shared/plugins/launcher/shared';

// What a launcher submission needs from the application's own bar: the one question it asks before
// sending anything anywhere. Everything else the launcher's bar does is the published baseline keymap.
type AppBar = { intercept: (line: string) => boolean };

// What a dispatch produced, as the line the rail shows. A `coreResponse` is one the application
// rendered itself, so repeating its text here would show the same answer twice; a line nothing claimed
// is reported as such, because the launcher has no shell to hand it to.
function shownFor(reply: LauncherDispatchReply, line: string): string | null {
  if (!reply.dispatched) return `No application command matches "${line}".`;
  if (reply.coreResponse || !reply.output) return null;
  return reply.output;
}

// Every command the launcher runs, from either of its two surfaces. A line typed into the bar and a
// row clicked in the rail are the same event — a command the user asked for — so they take the same
// path, in the order the shell tab's own bar takes:
//
// 1. the application's interception answers it — a picker, the queue, a quit confirmation — and
//    nothing is sent at all;
// 2. otherwise the launcher dispatches it as an application command, and answers back what the
//    command produced;
// 3. a command the dispatcher did not recognise is not written to a shell, because the launcher has
//    no shell. It is reported as one the application did not claim.
//
// The two surfaces differ only in how they name the command. A typed line is sent as a line. A rail
// row is sent as the id the host validated against `launcher.json`, so a client can never name a line
// the file did not hold — which is why a row that no longer resolves answers `null` and is reported
// as unclaimed rather than silently doing nothing.
export function useLauncherSubmit(input: {
  appBar: AppBar;
  capabilities: TabPluginClientCapabilities;
  onReply: (text: string | null) => void;
  clear: () => void;
}): {
  line: (text: string) => void;
  command: (entry: LauncherCommand) => void;
} {
  const { appBar, capabilities, onReply, clear } = input;
  // The lines this tab has sent, oldest first, so ArrowUp and ArrowDown recall them the way every other
  // bar in the application does. The launcher is one tab and one bar, so its own list is its whole
  // history.
  const sent: string[] = [];

  // Whatever the application answered with, put it where the user can read it — and where a rejection
  // lands too, so a failure is never the silent case.
  const answered = (reply: unknown, line: string): void => {
    if (reply === null || reply === undefined) onReply(`No application command matches "${line}".`);
    else onReply(shownFor(reply as LauncherDispatchReply, line));
  };

  return {
    line: (text: string) => {
      const line = text.trim();
      if (!line) return;
      clear();
      sent.push(line);
      // The application answers first: a picker, the queue, a quit confirmation. Nothing reaches the
      // server, exactly as nothing would if this had been typed into a shell tab's own bar.
      if (appBar.intercept(line)) return;
      void capabilities.intent<LauncherDispatchReply>('dispatch', { line })
        .then((reply) => { answered(reply, line); })
        .catch(() => { onReply(null); });
    },
    command: (entry: LauncherCommand) => {
      // The same interception, on the command the row names: `tasks` and `hist` are the application's
      // own pickers, and a click on a row saying so is a click, not a server dispatch.
      if (appBar.intercept(entry.command)) return;
      void capabilities.intent<LauncherDispatchReply>('run-command', { id: entry.id })
        .then((reply) => { answered(reply, entry.command); })
        .catch(() => { onReply(null); });
    },
  };
}
