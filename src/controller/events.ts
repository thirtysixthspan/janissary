import { messageBus } from '../bus.js';
import { notify } from '../notifications.js';
import type { Sinks } from '../types.js';
import type { Managers } from '../managers.js';

// Wires the message-bus subscriptions the Controller needs for the lifetime of the process:
// re-emitting state to clients, persisting agent state and notifying on new transcript entries,
// process exit, and PTY data/exit relaying. Split out of the Controller constructor purely to keep
// controller.ts under the file-size guideline; this has no state of its own.
export function wireControllerEvents(managers: Managers, sinks: Sinks): void {
  messageBus.on('state', 'dirty', () => sinks.emitState());
  messageBus.on('transcript', 'entry:appended', (event) => {
    if (event.type !== 'entry:appended') return;
    managers.tab.persist(managers.tab.buildAgentState(event.tab, { schedule: managers.schedule.get(event.tab.label) }));
    // A cross-agent `msg`/`broadcast` delivery sets `entry.from`; feed the notifications tab
    // (focus suppression and the per-event toggle are enforced inside `notify`).
    if (event.entry.from) notify(managers, 'incoming-message', event.tabLabel, event.entry.from);
  });
  messageBus.on('app', 'exit', () => sinks.exit?.());
  messageBus.on('layout', 'update', (event) => sinks.sendLayout?.({
    sidebarLeft: event.sidebarLeft,
    sidebarRight: event.sidebarRight,
    tabAreaPct: event.tabAreaPct,
    focusLeft: event.focusLeft,
    focusRight: event.focusRight,
  }));
  messageBus.on('pty', ['data', 'exit'], (event) => {
    if (event.type === 'data') { sinks.sendPty(event.id, event.data); return; }
    if (event.type !== 'exit') return;
    const harnessIndex = managers.tab.tabs.findIndex((tab) => tab.harness?.ptyId === event.id);
    if (harnessIndex !== -1) {
      sinks.sendPtyExit(event.id, event.exitCode);
      managers.tab.closeTab(harnessIndex);
      return;
    }
    sinks.sendPtyExit(event.id, event.exitCode);
  });
}
