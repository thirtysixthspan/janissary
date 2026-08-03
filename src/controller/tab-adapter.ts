import type { Managers } from '../managers.js';

export type TabControllerAdapter = {
  setActiveTab(index: number): void;
  focusTab(label: string): void;
  moveTabToOtherPane(index: number): void;
  moveTab(dir: -1 | 1): void;
  reorderTab(dir: -1 | 1): void;
  reorderTabTo(from: number, to: number): void;
  closeTab(index: number): void;
  renameTab(index: number, title: string): void;
  editQueuedCommand(index: number, text: string): void;
  deleteQueuedCommand(index: number): void;
  toggleCollapse(): void;
  ptyInput(id: string, data: string): void;
  ptyResize(id: string, cols: number, rows: number): void;
  ptyKill(id: string): void;
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
    closeTab: (index) => managers.tab.closeTab(index),
    renameTab: (index, title) => managers.tab.renameTab(index, title),
    editQueuedCommand: (index, text) => managers.tab.editQueued(managers.tab.cur().label, index, text),
    deleteQueuedCommand: (index) => managers.tab.deleteQueued(managers.tab.cur().label, index),
    toggleCollapse: () => managers.tab.toggleCollapse(),
    ptyInput: (id, data) => managers.pty.input(id, data),
    ptyResize: (id, cols, rows) => managers.pty.resizeOne(id, cols, rows),
    ptyKill: (id) => managers.pty.kill(id),
    resize: (cols, rows) => managers.pty.resize(cols, rows),
  };
}
