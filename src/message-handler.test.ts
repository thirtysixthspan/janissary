import { describe, it, expect, vi } from 'vitest';
import { handle } from './message-handler.js';
import type { Controller } from './controller.js';
import type { ClientMessage, ServerEvent, RpcCall } from './protocol.js';

const makeController = () =>
  ({
    view: vi.fn(() => []),
    routeView: vi.fn(() => null),
    managers: { tab: { activeTab: 0 } },
    dispatch: vi.fn(),
    setActiveTab: vi.fn(),
    closeTab: vi.fn(),
    renameTab: vi.fn(),
    editQueuedCommand: vi.fn(),
    deleteQueuedCommand: vi.fn(),
    moveTab: vi.fn(),
    reorderTab: vi.fn(),
    toggleCollapse: vi.fn(),
    chooseRoute: vi.fn(),
    complete: vi.fn(() => ({ suggestions: [] })),
    resize: vi.fn(),
    ptyInput: vi.fn(),
    ptyResize: vi.fn(),
    ptyKill: vi.fn(),
    runSuggestion: vi.fn(),
    rateSuggestion: vi.fn(),
    saveFile: vi.fn(),
    syncPageSnapshot: vi.fn(),
    fileTreeToggle: vi.fn(),
    fileTreeCollapseAll: vi.fn(),
    fileTreeReroot: vi.fn(),
    moveFileTreeItem: vi.fn(),
    deleteFileTreeItem: vi.fn(),
    setDock: vi.fn(),
    resetMonitorContext: vi.fn(),
    monitorContextSnapshot: vi.fn(),
    syncEditorBuffer: vi.fn(),
    undoFileTreeItem: vi.fn(() => ({})),
    redoFileTreeItem: vi.fn(() => ({})),
    openFileNavigatorFor: vi.fn(),
  }) as unknown as Controller;

const dispatchCall = (controller: Controller, id: number, call: RpcCall) => {
  const replies: ServerEvent[] = [];
  handle(controller, { t: 'rpc', id, ...call } as ClientMessage, (event) => {
    replies.push(event);
  });
  return replies;
};

describe('handle', () => {
  it('routes setActiveTab and acknowledges', () => {
    const controller = makeController();
    const replies = dispatchCall(controller, 1, { method: 'setActiveTab', params: { index: 2 } });
    expect(controller.setActiveTab).toHaveBeenCalledWith(2);
    expect(replies).toEqual([{ t: 'rpc-reply', id: 1, result: 'ok' }]);
  });

  it('routes closeTab', () => {
    const controller = makeController();
    dispatchCall(controller, 2, { method: 'closeTab', params: { index: 3 } });
    expect(controller.closeTab).toHaveBeenCalledWith(3);
  });

  it('routes renameTab', () => {
    const controller = makeController();
    dispatchCall(controller, 3, { method: 'renameTab', params: { index: 1, title: 'bob' } });
    expect(controller.renameTab).toHaveBeenCalledWith(1, 'bob');
  });

  it('routes editQueuedCommand', () => {
    const controller = makeController();
    dispatchCall(controller, 19, { method: 'editQueuedCommand', params: { index: 0, text: 'echo hi' } });
    expect(controller.editQueuedCommand).toHaveBeenCalledWith(0, 'echo hi');
  });

  it('routes deleteQueuedCommand', () => {
    const controller = makeController();
    dispatchCall(controller, 20, { method: 'deleteQueuedCommand', params: { index: 0 } });
    expect(controller.deleteQueuedCommand).toHaveBeenCalledWith(0);
  });

  it('routes moveTab', () => {
    const controller = makeController();
    dispatchCall(controller, 4, { method: 'moveTab', params: { dir: 1 } });
    expect(controller.moveTab).toHaveBeenCalledWith(1);
  });

  it('routes reorderTab', () => {
    const controller = makeController();
    dispatchCall(controller, 5, { method: 'reorderTab', params: { dir: -1 } });
    expect(controller.reorderTab).toHaveBeenCalledWith(-1);
  });

  it('routes toggleCollapse', () => {
    const controller = makeController();
    dispatchCall(controller, 6, { method: 'toggleCollapse' });
    expect(controller.toggleCollapse).toHaveBeenCalled();
  });

  it('routes chooseRoute', () => {
    const controller = makeController();
    dispatchCall(controller, 7, { method: 'chooseRoute', params: { index: 0 } });
    expect(controller.chooseRoute).toHaveBeenCalledWith(0);
  });

  it('routes resize', () => {
    const controller = makeController();
    dispatchCall(controller, 8, { method: 'resize', params: { cols: 80, rows: 24 } });
    expect(controller.resize).toHaveBeenCalledWith(80, 24);
  });

  it('routes ptyInput', () => {
    const controller = makeController();
    dispatchCall(controller, 9, { method: 'ptyInput', params: { id: 'p1', data: 'ls\n' } });
    expect(controller.ptyInput).toHaveBeenCalledWith('p1', 'ls\n');
  });

  it('routes ptyResize', () => {
    const controller = makeController();
    dispatchCall(controller, 10, { method: 'ptyResize', params: { id: 'p1', cols: 100, rows: 40 } });
    expect(controller.ptyResize).toHaveBeenCalledWith('p1', 100, 40);
  });

  it('routes ptyKill', () => {
    const controller = makeController();
    dispatchCall(controller, 11, { method: 'ptyKill', params: { id: 'p1' } });
    expect(controller.ptyKill).toHaveBeenCalledWith('p1');
  });

  it('routes runSuggestion', () => {
    const controller = makeController();
    dispatchCall(controller, 12, { method: 'runSuggestion', params: { id: 's1' } });
    expect(controller.runSuggestion).toHaveBeenCalledWith('s1');
  });

  it('routes rateSuggestion', () => {
    const controller = makeController();
    dispatchCall(controller, 13, { method: 'rateSuggestion', params: { id: 's1', up: true } });
    expect(controller.rateSuggestion).toHaveBeenCalledWith('s1', true);
  });

  it('routes saveFile', () => {
    const controller = makeController();
    dispatchCall(controller, 14, { method: 'saveFile', params: { url: 'file:///a.ts', content: 'x' } });
    expect(controller.saveFile).toHaveBeenCalledWith('file:///a.ts', 'x');
  });

  it('routes pageSync', () => {
    const controller = makeController();
    dispatchCall(controller, 21, { method: 'pageSync', params: { url: 'https://example.org', text: 'visible text' } });
    expect(controller.syncPageSnapshot).toHaveBeenCalledWith('https://example.org', 'visible text');
  });

  it('routes fileTreeToggle', () => {
    const controller = makeController();
    dispatchCall(controller, 15, { method: 'fileTreeToggle', params: { index: 0, path: '/a' } });
    expect(controller.fileTreeToggle).toHaveBeenCalledWith(0, '/a');
  });

  it('routes fileTreeCollapseAll', () => {
    const controller = makeController();
    dispatchCall(controller, 16, { method: 'fileTreeCollapseAll', params: { index: 0 } });
    expect(controller.fileTreeCollapseAll).toHaveBeenCalledWith(0);
  });

  it('routes fileTreeReroot', () => {
    const controller = makeController();
    dispatchCall(controller, 17, { method: 'fileTreeReroot', params: { index: 0 } });
    expect(controller.fileTreeReroot).toHaveBeenCalledWith(0, undefined);
  });

  it('routes moveFileTreeItem', () => {
    const controller = makeController();
    dispatchCall(controller, 19, { method: 'moveFileTreeItem', params: { index: 0, fromRelPath: 'a', toRelPath: 'b' } });
    expect(controller.moveFileTreeItem).toHaveBeenCalledWith(0, 'a', 'b');
  });

  it('routes deleteFileTreeItem', () => {
    const controller = makeController();
    dispatchCall(controller, 20, { method: 'deleteFileTreeItem', params: { index: 0, relPath: 'a' } });
    expect(controller.deleteFileTreeItem).toHaveBeenCalledWith(0, 'a');
  });

  it('routes setDock', () => {
    const controller = makeController();
    dispatchCall(controller, 18, { method: 'setDock', params: { index: 0, dock: 'left' } });
    expect(controller.setDock).toHaveBeenCalledWith(0, 'left');
  });

  it('routes resetMonitorContext', () => {
    const controller = makeController();
    dispatchCall(controller, 22, { method: 'resetMonitorContext', params: { name: 'agent-1' } });
    expect(controller.resetMonitorContext).toHaveBeenCalledWith('agent-1');
  });

  it('routes monitorContextSnapshot', () => {
    const controller = makeController();
    dispatchCall(controller, 23, { method: 'monitorContextSnapshot', params: { name: 'agent-1' } });
    expect(controller.monitorContextSnapshot).toHaveBeenCalledWith('agent-1');
  });

  it('routes editorSync', () => {
    const controller = makeController();
    dispatchCall(controller, 24, { method: 'editorSync', params: { url: 'file:///a.ts', content: 'x' } });
    expect(controller.syncEditorBuffer).toHaveBeenCalledWith('file:///a.ts', 'x');
  });

  it('routes undoFileTreeItem and replies with its result', () => {
    const controller = makeController();
    (controller.undoFileTreeItem as ReturnType<typeof vi.fn>).mockReturnValue({ conflict: { fromRelPath: 'a', toRelPath: 'b' } });
    const replies = dispatchCall(controller, 25, { method: 'undoFileTreeItem', params: { index: 0, overwrite: true } });
    expect(controller.undoFileTreeItem).toHaveBeenCalledWith(0, true);
    expect(replies).toEqual([{ t: 'rpc-reply', id: 25, result: { conflict: { fromRelPath: 'a', toRelPath: 'b' } } }]);
  });

  it('routes redoFileTreeItem and replies with its result', () => {
    const controller = makeController();
    (controller.redoFileTreeItem as ReturnType<typeof vi.fn>).mockReturnValue({});
    const replies = dispatchCall(controller, 26, { method: 'redoFileTreeItem', params: { index: 0 } });
    expect(controller.redoFileTreeItem).toHaveBeenCalledWith(0, undefined);
    expect(replies).toEqual([{ t: 'rpc-reply', id: 26, result: {} }]);
  });

  it('routes openFileNavigatorFor', () => {
    const controller = makeController();
    dispatchCall(controller, 27, { method: 'openFileNavigatorFor', params: { label: 'janus' } });
    expect(controller.openFileNavigatorFor).toHaveBeenCalledWith('janus');
  });
});
