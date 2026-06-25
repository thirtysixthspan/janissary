import type { Command } from './types.js';
import {
  closeConnection, listOpenConnections,
  parseConnectionCommand,
} from '../connections.js';

export const command: Command = {
  name: 'connection',
  match: (command_) => /^connection\b/i.test(command_),
  handler: (command_, context) => {
    const {
      updateCurrentTab, tabs, activeTab, shellsRef, acpRef, browserRef,
      appendLog, finishRunning, closeBrowserWindow,
      forgetDbConn, setShellActive, setAcpInfo, shellName,
    } = context;
    const tabIndex = activeTab;
    const tabLabel = tabs[tabIndex].label;
    const trimmed = command_;
    const parsed = parseConnectionCommand(trimmed);
    if (!('error' in parsed) && parsed.action === 'close' && parsed.kind === 'browser') {
      appendLog(tabLabel, { input: trimmed, output: '', running: true });
      void (async () => finishRunning(tabLabel, await closeBrowserWindow(tabIndex, parsed.id)))();
      return;
    }
    let output: string;
    if ('error' in parsed) {
      output = parsed.error;
    } else if (parsed.action === 'list') {
      const lines: string[] = [];
      if (shellsRef.current.get(tabIndex)) lines.push(`shell:${shellName}`);
      if (acpRef.current.get(tabIndex)) lines.push('acp:opencode');
      for (const id of browserRef.current.get(tabIndex)?.browser.windowIds() ?? []) lines.push(`browser:${id}`);
      for (const n of listOpenConnections()) lines.push(`sqlite:${n}`);
      output = lines.length > 0 ? lines.join('\n') : 'No open connections.';
    } else if (parsed.kind === 'sqlite') {
      if (closeConnection(parsed.id)) {
        forgetDbConn(parsed.id);
        output = `Closed connection sqlite:${parsed.id}.`;
      } else {
        output = `No open connection sqlite:${parsed.id}.`;
      }
    } else if (parsed.kind === 'shell') {
      if (parsed.id !== shellName) {
        output = `No open connection shell:${parsed.id} (this tab's shell is "${shellName}").`;
      } else if (shellsRef.current.get(tabIndex)) {
        shellsRef.current.get(tabIndex)?.kill();
        shellsRef.current.delete(tabIndex);
        setShellActive((previous) => { const c = { ...previous }; delete c[tabIndex]; return c; });
        output = `Closed connection shell:${shellName}.`;
      } else {
        output = `No open connection shell:${shellName}.`;
      }
    } else {
      if (parsed.id !== 'opencode') {
        output = `No open connection acp:${parsed.id} (the acp agent is "opencode").`;
      } else if (acpRef.current.get(tabIndex)) {
        acpRef.current.get(tabIndex)?.kill();
        acpRef.current.delete(tabIndex);
        setAcpInfo((previous) => { const c = { ...previous }; delete c[tabIndex]; return c; });
        output = 'Closed connection acp:opencode.';
      } else {
        output = 'No open connection acp:opencode.';
      }
    }
    updateCurrentTab((tab) => ({ ...tab, log: [...tab.log, { input: trimmed, output }], scrollOffset: 0 }));
  },
};
