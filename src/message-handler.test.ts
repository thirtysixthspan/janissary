import { describe, it, expect, vi } from 'vitest';
import { handle } from './message-handler.js';
import type { Controller } from './controller.js';
import type { ClientMessage, ServerEvent, RpcCall } from './protocol.js';

const makeController = () =>
  ({
    view: vi.fn(() => []),
    routeView: vi.fn(() => null),
    stateEvent: vi.fn(() => ({ t: 'state' })),
    managers: {
      tab: {
        activeTab: 0,
        launchDir: '/proj',
        findIndex: vi.fn(() => 2),
        setActiveTab: vi.fn(),
        moveTabToOtherPane: vi.fn(),
      },
      questions: { answer: vi.fn(() => true) },
      schedule: { clearAll: vi.fn() },
    },
    dispatch: vi.fn(),
    cancelSchedule: vi.fn(),
    clearSchedules: vi.fn(),
    answerQuestion: vi.fn(),
    launchAgentFor: vi.fn(),
    setActiveTab: vi.fn(),
    focusTab: vi.fn(),
    moveTabToOtherPane: vi.fn(),
    closeTab: vi.fn(),
    renameTab: vi.fn(),
    navigatePage: vi.fn(),
    editQueuedCommand: vi.fn(),
    deleteQueuedCommand: vi.fn(),
    moveTab: vi.fn(),
    reorderTab: vi.fn(),
    reorderTabTo: vi.fn(),
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
    pluginIntent: vi.fn(async () => ({ schemaVersion: 1, payload: { name: 'clip.shot-1.png' } })),
    syncPageSnapshot: vi.fn(),
    fileNavigatorToggle: vi.fn(),
    fileNavigatorCollapseAll: vi.fn(),
    fileNavigatorReroot: vi.fn(),
    moveFileNavigatorItem: vi.fn(),
    deleteFileNavigatorItem: vi.fn(),
    setDock: vi.fn(),
    resetMonitorContext: vi.fn(),
    monitorContextSnapshot: vi.fn(),
    syncEditorBuffer: vi.fn(),
    resyncEditorTab: vi.fn(),
    undoFileNavigatorItem: vi.fn(() => ({})),
    redoFileNavigatorItem: vi.fn(() => ({})),
    openFileNavigatorFor: vi.fn(),
    moveFileNavigatorItems: vi.fn(() => ({ total: 0, failedPaths: [] })),
    pasteFileNavigatorItems: vi.fn(() => ({ total: 0, failedPaths: [] })),
    deleteFileNavigatorItems: vi.fn(() => ({ total: 0, failedPaths: [] })),
    renameFileNavigatorItem: vi.fn(),
    fileNavigatorSearch: vi.fn(async () => []),
    revealFileNavigatorItem: vi.fn(),
    fileNavigatorOpeners: vi.fn(() => ({ choices: [] })),
    reportFileNavigatorSelection: vi.fn(),
    openTranscriptFor: vi.fn(),
    openHarnessTranscriptFor: vi.fn(),
    openAcpTranscript: vi.fn(),
    reportLayout: vi.fn(),
    projectFiles: vi.fn(async () => ({ root: '/proj', paths: [] })),
    projectFilesFallback: vi.fn(() => ({ root: '/proj', paths: [] })),
    editorPersonas: vi.fn(() => []),
    editorSuggest: vi.fn(),
    closeEditorConnection: vi.fn(),
  }) as unknown as Controller;

const dispatchCall = (controller: Controller, id: number, call: RpcCall) => {
  const replies: ServerEvent[] = [];
  handle(controller, { t: 'rpc', id, ...call } as ClientMessage, (event) => {
    replies.push(event);
  });
  return replies;
};

describe('handle', () => {
  it('does not acknowledge an unknown method', () => {
    const controller = makeController();
    const replies: ServerEvent[] = [];
    handle(
      controller,
      { t: 'rpc', id: 99, method: 'unknown', params: {} } as unknown as ClientMessage,
      (event) => { replies.push(event); },
    );
    expect(replies).toEqual([]);
  });

  it('routes setActiveTab and acknowledges', () => {
    const controller = makeController();
    const replies = dispatchCall(controller, 1, { method: 'setActiveTab', params: { index: 2 } });
    expect(controller.setActiveTab).toHaveBeenCalledWith(2);
    expect(replies).toEqual([{ t: 'rpc-reply', id: 1, result: 'ok' }]);
  });

  it('focuses a tab through the controller façade', () => {
    const controller = makeController();
    dispatchCall(controller, 32, { method: 'focusTab', params: { label: 'build' } });
    expect(controller.focusTab).toHaveBeenCalledWith('build');
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

  it('routes navigatePage', () => {
    const controller = makeController();
    dispatchCall(controller, 3, { method: 'navigatePage', params: { index: 1, url: 'https://example.com/' } });
    expect(controller.navigatePage).toHaveBeenCalledWith(1, 'https://example.com/');
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

  it('routes moveTabToOtherPane through the controller façade', () => {
    const controller = makeController();
    dispatchCall(controller, 34, { method: 'moveTabToOtherPane', params: { index: 2 } });
    expect(controller.moveTabToOtherPane).toHaveBeenCalledWith(2);
  });

  it('routes reorderTab', () => {
    const controller = makeController();
    dispatchCall(controller, 5, { method: 'reorderTab', params: { dir: -1 } });
    expect(controller.reorderTab).toHaveBeenCalledWith(-1);
  });

  it('routes reorderTabTo', () => {
    const controller = makeController();
    dispatchCall(controller, 33, { method: 'reorderTabTo', params: { from: 1, to: 3 } });
    expect(controller.reorderTabTo).toHaveBeenCalledWith(1, 3);
  });

  it('routes toggleCollapse', () => {
    const controller = makeController();
    dispatchCall(controller, 6, { method: 'toggleCollapse', params: {} });
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

  it('answers a malformed plugin intent with an RPC error and never reaches the controller', () => {
    const controller = makeController();
    for (const params of [
      { tab: '', schemaVersion: 1, intent: 'capture-frame', payload: {} },
      { tab: 'video', schemaVersion: 0, intent: 'capture-frame', payload: {} },
      { tab: 'video', schemaVersion: 1, intent: '', payload: {} },
      { tab: 'video', schemaVersion: 1, intent: 'capture-frame', payload: { nested: undefined } },
    ]) {
      const replies: ServerEvent[] = [];
      handle(controller, { t: 'rpc', id: 17, method: 'pluginIntent', params } as ClientMessage, (event) => { replies.push(event); });
      expect(replies).toEqual([{ t: 'rpc-reply', id: 17, error: 'pluginIntent: invalid request' }]);
    }
    expect(controller.pluginIntent).not.toHaveBeenCalled();
  });

  it('routes pluginIntent and replies with the plugin-owned envelope', async () => {
    const controller = makeController();
    const request = {
      tab: 'video', schemaVersion: 1, intent: 'capture-frame', payload: { dataUrl: 'data:image/png;base64,AA==' },
    };
    const replies = dispatchCall(controller, 15, {
      method: 'pluginIntent', params: request,
    });
    expect(controller.pluginIntent).toHaveBeenCalledWith(request);
    await vi.waitFor(() => {
      expect(replies).toEqual([{
        t: 'rpc-reply', id: 15, result: { schemaVersion: 1, payload: { name: 'clip.shot-1.png' } },
      }]);
    });
  });

  it('returns a plugin-intent rejection through the ordinary RPC error path', async () => {
    const controller = makeController();
    vi.mocked(controller.pluginIntent).mockRejectedValueOnce(new Error('pluginIntent: invalid payload'));
    const replies = dispatchCall(controller, 16, {
      method: 'pluginIntent',
      params: { tab: 'video', schemaVersion: 1, intent: 'bad', payload: {} },
    });
    await vi.waitFor(() => {
      expect(replies).toEqual([{ t: 'rpc-reply', id: 16, error: 'pluginIntent: invalid payload' }]);
    });
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

  it('routes fileNavigatorToggle', () => {
    const controller = makeController();
    dispatchCall(controller, 15, { method: 'fileNavigatorToggle', params: { index: 0, path: '/a' } });
    expect(controller.fileNavigatorToggle).toHaveBeenCalledWith(0, '/a');
  });

  it('routes fileNavigatorCollapseAll', () => {
    const controller = makeController();
    dispatchCall(controller, 16, { method: 'fileNavigatorCollapseAll', params: { index: 0 } });
    expect(controller.fileNavigatorCollapseAll).toHaveBeenCalledWith(0);
  });

  it('routes fileNavigatorReroot', () => {
    const controller = makeController();
    dispatchCall(controller, 17, { method: 'fileNavigatorReroot', params: { index: 0 } });
    expect(controller.fileNavigatorReroot).toHaveBeenCalledWith(0, undefined);
  });

  it('routes moveFileNavigatorItem', () => {
    const controller = makeController();
    dispatchCall(controller, 19, { method: 'moveFileNavigatorItem', params: { index: 0, fromRelPath: 'a', toRelPath: 'b' } });
    expect(controller.moveFileNavigatorItem).toHaveBeenCalledWith(0, 'a', 'b');
  });

  it('routes deleteFileNavigatorItem', () => {
    const controller = makeController();
    dispatchCall(controller, 20, { method: 'deleteFileNavigatorItem', params: { index: 0, relPath: 'a' } });
    expect(controller.deleteFileNavigatorItem).toHaveBeenCalledWith(0, 'a');
  });

  it('routes moveFileNavigatorItems and replies with its result', () => {
    const controller = makeController();
    (controller.moveFileNavigatorItems as ReturnType<typeof vi.fn>).mockReturnValue({ total: 2, failedPaths: ['b'] });
    const replies = dispatchCall(controller, 44, {
      method: 'moveFileNavigatorItems',
      params: { index: 0, sourcePaths: ['a', 'b'], destinationPath: 'dest' },
    });
    expect(controller.moveFileNavigatorItems).toHaveBeenCalledWith(0, ['a', 'b'], 'dest', undefined);
    expect(replies).toEqual([{ t: 'rpc-reply', id: 44, result: { total: 2, failedPaths: ['b'] } }]);
  });

  it('routes deleteFileNavigatorItems and replies with its result', () => {
    const controller = makeController();
    (controller.deleteFileNavigatorItems as ReturnType<typeof vi.fn>).mockReturnValue({ total: 2, failedPaths: [] });
    const replies = dispatchCall(controller, 45, {
      method: 'deleteFileNavigatorItems',
      params: { index: 0, paths: ['a', 'b'] },
    });
    expect(controller.deleteFileNavigatorItems).toHaveBeenCalledWith(0, ['a', 'b']);
    expect(replies).toEqual([{ t: 'rpc-reply', id: 45, result: { total: 2, failedPaths: [] } }]);
  });

  it('routes pasteFileNavigatorItems and replies with its result', () => {
    const controller = makeController();
    (controller.pasteFileNavigatorItems as ReturnType<typeof vi.fn>).mockReturnValue({ total: 1, failedPaths: [] });
    const replies = dispatchCall(controller, 46, {
      method: 'pasteFileNavigatorItems',
      params: { index: 0, sources: ['/a/b.txt'], destinationPath: 'dest', mode: 'copy' },
    });
    expect(controller.pasteFileNavigatorItems).toHaveBeenCalledWith(0, ['/a/b.txt'], 'dest', 'copy', undefined);
    expect(replies).toEqual([{ t: 'rpc-reply', id: 46, result: { total: 1, failedPaths: [] } }]);
  });

  it('routes reportFileNavigatorSelection to the tree-state resolver', () => {
    const controller = makeController();
    dispatchCall(controller, 47, {
      method: 'reportFileNavigatorSelection',
      params: { id: 7, navigators: [] },
    });
    expect(controller.reportFileNavigatorSelection).toHaveBeenCalledWith(7, []);
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

  it('routes resyncEditorTab', () => {
    const controller = makeController();
    dispatchCall(controller, 26, { method: 'resyncEditorTab', params: { url: 'file:///a.ts' } });
    expect(controller.resyncEditorTab).toHaveBeenCalledWith('file:///a.ts');
  });

  it('routes undoFileNavigatorItem and replies with its result', () => {
    const controller = makeController();
    (controller.undoFileNavigatorItem as ReturnType<typeof vi.fn>).mockReturnValue({ conflict: { fromRelPath: 'a', toRelPath: 'b' } });
    const replies = dispatchCall(controller, 25, { method: 'undoFileNavigatorItem', params: { index: 0, overwrite: true } });
    expect(controller.undoFileNavigatorItem).toHaveBeenCalledWith(0, true, undefined);
    expect(replies).toEqual([{ t: 'rpc-reply', id: 25, result: { conflict: { fromRelPath: 'a', toRelPath: 'b' } } }]);
  });

  it('routes redoFileNavigatorItem and replies with its result', () => {
    const controller = makeController();
    (controller.redoFileNavigatorItem as ReturnType<typeof vi.fn>).mockReturnValue({});
    const replies = dispatchCall(controller, 26, { method: 'redoFileNavigatorItem', params: { index: 0 } });
    expect(controller.redoFileNavigatorItem).toHaveBeenCalledWith(0, undefined, undefined);
    expect(replies).toEqual([{ t: 'rpc-reply', id: 26, result: {} }]);
  });

  it('routes openFileNavigatorFor', () => {
    const controller = makeController();
    dispatchCall(controller, 27, { method: 'openFileNavigatorFor', params: { label: 'janus' } });
    expect(controller.openFileNavigatorFor).toHaveBeenCalledWith('janus');
  });

  it('routes answerQuestion through the controller façade', () => {
    const controller = makeController();
    dispatchCall(controller, 31, {
      method: 'answerQuestion',
      params: { tab: 'janus', id: 'question-1', answer: 'Yes' },
    });
    expect(controller.answerQuestion).toHaveBeenCalledWith('janus', 'question-1', 'Yes');
  });

  it('routes openTranscriptFor through the controller façade', () => {
    const controller = makeController();
    dispatchCall(controller, 28, { method: 'openTranscriptFor', params: { label: 'janus' } });
    expect(controller.openTranscriptFor).toHaveBeenCalledWith('janus');
  });

  it('routes openHarnessTranscriptFor through the controller façade', () => {
    const controller = makeController();
    dispatchCall(controller, 30, { method: 'openHarnessTranscriptFor', params: { label: 'claude' } });
    expect(controller.openHarnessTranscriptFor).toHaveBeenCalledWith('claude');
  });

  it('routes openAcpTranscript through the controller façade', () => {
    const controller = makeController();
    dispatchCall(controller, 29, { method: 'openAcpTranscript', params: { acpRef: { scope: 'tab', label: 'janus' } } });
    expect(controller.openAcpTranscript).toHaveBeenCalledWith({ scope: 'tab', label: 'janus' });
  });

  it('routes reportLayout through the controller façade', () => {
    const controller = makeController();
    dispatchCall(controller, 30, { method: 'reportLayout', params: { sidebarLeft: 320, sidebarRight: 280, tabAreaPct: 70 } });
    expect(controller.reportLayout).toHaveBeenCalledWith({ sidebarLeft: 320, sidebarRight: 280, tabAreaPct: 70 });
  });

  it('routes projectFiles to a deferred reply carrying the resolved root and paths', async () => {
    const controller = makeController();
    (controller.projectFiles as ReturnType<typeof vi.fn>).mockResolvedValue({ root: '/proj', paths: ['a.ts', 'b.ts'] });
    const replies: ServerEvent[] = [];
    handle(controller, { t: 'rpc', id: 29, method: 'projectFiles', params: {} } as ClientMessage, (event) => { replies.push(event); });
    expect(replies).toEqual([]);
    await vi.waitFor(() => expect(replies).toHaveLength(1));
    expect(replies).toEqual([{ t: 'rpc-reply', id: 29, result: { root: '/proj', paths: ['a.ts', 'b.ts'] } }]);
  });

  it('replies with an empty paths list — never leaving the request pending — when the listing rejects', async () => {
    const controller = makeController();
    (controller.projectFiles as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
    const replies: ServerEvent[] = [];
    handle(controller, { t: 'rpc', id: 30, method: 'projectFiles', params: {} } as ClientMessage, (event) => { replies.push(event); });
    await vi.waitFor(() => expect(replies).toHaveLength(1));
    expect(replies).toEqual([{ t: 'rpc-reply', id: 30, result: { root: '/proj', paths: [] } }]);
  });

  it('routes fileNavigatorSearch to a deferred reply carrying the resolved paths', async () => {
    const controller = makeController();
    (controller.fileNavigatorSearch as ReturnType<typeof vi.fn>).mockResolvedValue(['a.ts', 'b.ts']);
    const replies: ServerEvent[] = [];
    handle(controller, { t: 'rpc', id: 31, method: 'fileNavigatorSearch', params: { index: 0 } } as ClientMessage, (event) => { replies.push(event); });
    expect(replies).toEqual([]);
    await vi.waitFor(() => expect(replies).toHaveLength(1));
    expect(controller.fileNavigatorSearch).toHaveBeenCalledWith(0);
    expect(replies).toEqual([{ t: 'rpc-reply', id: 31, result: { paths: ['a.ts', 'b.ts'] } }]);
  });

  it('replies with an empty paths list for fileNavigatorSearch — never leaving the request pending — when the listing rejects', async () => {
    const controller = makeController();
    (controller.fileNavigatorSearch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
    const replies: ServerEvent[] = [];
    handle(controller, { t: 'rpc', id: 32, method: 'fileNavigatorSearch', params: { index: 0 } } as ClientMessage, (event) => { replies.push(event); });
    await vi.waitFor(() => expect(replies).toHaveLength(1));
    expect(replies).toEqual([{ t: 'rpc-reply', id: 32, result: { paths: [] } }]);
  });

  it('routes revealFileNavigatorItem through the controller façade', () => {
    const controller = makeController();
    dispatchCall(controller, 33, { method: 'revealFileNavigatorItem', params: { index: 0, relPath: 'src/a.ts' } });
    expect(controller.revealFileNavigatorItem).toHaveBeenCalledWith(0, 'src/a.ts');
  });

  it('routes cancelSchedule', () => {
    const controller = makeController();
    dispatchCall(controller, 40, { method: 'cancelSchedule', params: { tab: 'janus', id: 'sched-1' } });
    expect(controller.cancelSchedule).toHaveBeenCalledWith('janus', 'sched-1');
  });

  it('routes clearSchedules through the controller façade', () => {
    const controller = makeController();
    dispatchCall(controller, 41, { method: 'clearSchedules', params: {} });
    expect(controller.clearSchedules).toHaveBeenCalled();
  });

  it('routes launchAgentFor', () => {
    const controller = makeController();
    dispatchCall(controller, 42, { method: 'launchAgentFor', params: { label: 'janus' } });
    expect(controller.launchAgentFor).toHaveBeenCalledWith('janus');
  });

  it('routes editorPersonas to a reply carrying the editor persona names', () => {
    const controller = makeController();
    const replies = dispatchCall(controller, 43, { method: 'editorPersonas', params: {} });
    expect(controller.editorPersonas).toHaveBeenCalled();
    expect(replies).toEqual([{ t: 'rpc-reply', id: 43, result: { names: expect.any(Array) } }]);
  });

  it('routes editorSuggest to a deferred reply carrying the callback result', () => {
    const controller = makeController();
    (controller.editorSuggest as ReturnType<typeof vi.fn>).mockImplementation((_params, callback) => {
      callback({ hunks: [] });
    });
    const replies = dispatchCall(controller, 46, {
      method: 'editorSuggest',
      params: { url: 'file:///a.ts', persona: 'reviewer', content: 'x', prompt: 'improve' },
    });
    expect(controller.editorSuggest).toHaveBeenCalledWith({ url: 'file:///a.ts', persona: 'reviewer', content: 'x', prompt: 'improve' }, expect.any(Function));
    expect(replies).toEqual([{ t: 'rpc-reply', id: 46, result: { hunks: [] } }]);
  });

  it('routes closeEditorConnection through the controller façade and acknowledges', () => {
    const controller = makeController();
    const replies = dispatchCall(controller, 47, {
      method: 'closeEditorConnection',
      params: { url: 'file:///a.ts', persona: 'reviewer' },
    });
    expect(controller.closeEditorConnection).toHaveBeenCalledWith('file:///a.ts', 'reviewer');
    expect(replies).toEqual([{ t: 'rpc-reply', id: 47, result: 'ok' }]);
  });
});
