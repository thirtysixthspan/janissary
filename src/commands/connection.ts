import type { Command } from './types.js';
import {
  parseConnectionCommand,
} from '../connections.js';
import {
  handleListConnections,
  handleSqliteConnection,
  handleShellConnection,
  handleAcpConnection,
  type HandlerContext,
} from './connection-handlers.js';

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
      const handlerContext: HandlerContext = {
        activeTab, shellsRef, acpRef, browserRef,
        forgetDbConn, setShellActive, setAcpInfo, shellName,
      };
      output = handleListConnections(handlerContext);
    } else if (parsed.kind === 'sqlite') {
      const handlerContext: HandlerContext = {
        activeTab, shellsRef, acpRef, browserRef,
        forgetDbConn, setShellActive, setAcpInfo, shellName,
      };
      output = handleSqliteConnection(parsed, handlerContext);
    } else if (parsed.kind === 'shell') {
      const handlerContext: HandlerContext = {
        activeTab, shellsRef, acpRef, browserRef,
        forgetDbConn, setShellActive, setAcpInfo, shellName,
      };
      output = handleShellConnection(parsed, handlerContext);
    } else {
      const handlerContext: HandlerContext = {
        activeTab, shellsRef, acpRef, browserRef,
        forgetDbConn, setShellActive, setAcpInfo, shellName,
      };
      output = handleAcpConnection(parsed, handlerContext);
    }
    updateCurrentTab((tab) => ({ ...tab, log: [...tab.log, { input: trimmed, output }], scrollOffset: 0 }));
  },
};
