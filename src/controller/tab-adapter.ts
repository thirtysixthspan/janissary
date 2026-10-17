import type { Managers } from '../managers.js';
import type { TerminalColors } from '../harness/terminal-colors.js';
import { escalateToFeed } from '../notifications/deliver.js';

export type TabControllerAdapter = {
  setActiveTab(index: number): void;
  focusTab(label: string): void;
  moveTabToOtherPane(index: number): void;
  moveTab(dir: -1 | 1): void;
  reorderTab(dir: -1 | 1): void;
  reorderTabTo(from: number, to: number): void;
  closeTab(label: string, terminalExited?: string): void;
  renameTab(index: number, title: string): void;
  editQueuedCommand(index: number, text: string, tab?: string): void;
  deleteQueuedCommand(index: number, tab?: string): void;
  toggleCollapse(tab?: string): void;
  revealNotifications(): void;
  ptyInput(id: string, data: string, tab?: string): void;
  ptyResize(id: string, cols: number, rows: number, tab?: string): void;
  pluginTerminalAttach(id: string, tab: string): boolean;
  ptyKill(id: string): void;
  reportTerminalColors(id: string, colors: TerminalColors): void;
  resize(cols: number, rows: number): void;
};

export function createTabControllerAdapter(managers: Managers): TabControllerAdapter {
  return {
    setActiveTab: (index) => managers.tab.setActiveTab(index),
    focusTab: (label) => managers.tab.setActiveTab(managers.tab.findIndex(label)),
    moveTabToOtherPane: (index) => managers.tab.moveTabToOtherPane(index),
    moveTab: (dir) => managers.tab.moveTab(dir),
    reorderTab: (dir) => managers.tab.reorderTab(dir),
    reorderTabTo: (from, to) => managers.tab.reorderTabTo(from, to),
    closeTab: (label, terminalExited) => {
      const index = managers.tab.findIndex(label);
      const tab = managers.tab.tabs[index];
      if (!tab) return;
      if (terminalExited === undefined) {
        managers.tab.userCloseTab(index);
        return;
      }
      if (tab.runtime?.closing || tab.view !== 'plugin' || tab.plugin?.id !== 'shell') return;
      if (!managers.plugins.isPayload('shell', tab.plugin.payload)) return;
      const payload = tab.plugin.payload;
      if (typeof payload !== 'object' || payload === null || !('ptyId' in payload)) return;
      if (payload.ptyId !== terminalExited || managers.pty.isRunningFor(terminalExited, [label])) return;
      if (tab.systemShell) {
        void managers.systemShell.handlePtyExit(terminalExited);
        return;
      }
      managers.tab.closeTab(index);
    },
    renameTab: (index, title) => managers.tab.renameTab(index, title),
    editQueuedCommand: (index, text, tab) => managers.tab.editQueued(tab ?? managers.tab.cur().label, index, text),
    deleteQueuedCommand: (index, tab) => managers.tab.deleteQueued(tab ?? managers.tab.cur().label, index),
    toggleCollapse: (tab) => tab === undefined ? managers.tab.toggleCollapse() : managers.tab.toggleCollapse(tab),
    revealNotifications: () => escalateToFeed(managers),
    ptyInput: (id, data, tab) => { if (!tab || managers.pty.isRunningFor(id, [tab])) managers.pty.input(id, data); },
    ptyResize: (id, cols, rows, tab) => { if (!tab || managers.pty.isRunningFor(id, [tab])) managers.pty.resizeOne(id, cols, rows); },
    pluginTerminalAttach: (id, tab) => managers.pty.isRunningFor(id, [tab]),
    ptyKill: (id) => managers.pty.kill(id),
    reportTerminalColors: (id, colors) => managers.harness.reportTerminalColors(id, colors),
    resize: (cols, rows) => managers.pty.resize(cols, rows),
  };
}
