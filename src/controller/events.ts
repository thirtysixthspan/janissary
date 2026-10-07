import { messageBus } from '../bus.js';
import { notify } from '../notifications/index.js';
import type { Sinks } from './types.js';
import type { Managers } from '../managers.js';

// Wires the message-bus subscriptions the Controller needs for the lifetime of the process:
// re-emitting state to clients, notifying on new transcript entries,
// process exit, and PTY data/exit relaying. Split out of the Controller constructor purely to keep
// controller.ts under the file-size guideline; this has no state of its own.
export function wireControllerEvents(managers: Managers, sinks: Sinks): void {
  messageBus.on('state', 'dirty', () => sinks.emitState());
  messageBus.on('transcript', 'entry:appended', (event) => {
    if (event.type !== 'entry:appended') return;
    // A cross-agent `msg`/`broadcast` delivery sets `entry.from`; feed the notifications tab
    // (focus suppression and the per-event toggle are enforced inside `notify`).
    if (event.entry.from) notify(managers, 'incoming-message', event.tabLabel, event.entry.from);
  });
  messageBus.on('app', 'exit', () => sinks.exit?.());
  messageBus.on('layout', 'update', ({ type: _type, ...update }) => sinks.sendLayout?.(update));
  messageBus.on('fileNavigator', 'collect', (event) => sinks.sendCollectTreeState?.({ id: event.id }));
  messageBus.on('notifications', ['toast', 'clear', 'reveal', 'native-notification'], (event) => {
    if (event.type === 'clear') { sinks.sendToastClear?.(); return; }
    if (event.type === 'reveal') { sinks.sendNotificationsReveal?.(event.dock); return; }
    if (event.type === 'native-notification') {
      sinks.sendNativeNotification?.({
        tab: event.tab,
        from: event.from,
        message: event.message,
        category: event.category,
        desktop: event.desktop,
        volume: event.volume,
      });
      return;
    }
    sinks.sendToast?.({ from: event.from, message: event.message, color: event.color });
  });
  messageBus.on('pty', ['data', 'exit'], (event) => {
    if (event.type === 'data') { sinks.sendPty(event.id, event.data); return; }
    if (event.type !== 'exit') return;
    const harnessTab = managers.tab.harnessTabByPtyId(event.id);
    if (harnessTab) {
      sinks.sendPtyExit(event.id, event.exitCode);
      if (harnessTab.remote && harnessTab.harness?.sessionTerminated) return;
      managers.tab.closeTab(managers.tab.tabs.indexOf(harnessTab));
      return;
    }
    sinks.sendPtyExit(event.id, event.exitCode);
  });
}
