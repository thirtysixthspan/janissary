import { describe, it, expect, vi } from 'vitest';
import { handle } from './message-handler.js';
import type { Controller } from './controller.js';
import type { ClientMessage, ServerEvent, RpcCall } from './protocol.js';
import { openTranscriptFor, openAcpTranscript } from './controller/transcript.js';
import { projectFilesFor } from './project-files.js';
import { fileNavigatorSearch, revealFileNavigatorItem } from './controller/file-navigator.js';
import { setClientLayout } from './client-layout.js';

vi.mock('./controller/transcript.js', () => ({ openTranscriptFor: vi.fn(), openAcpTranscript: vi.fn() }));
vi.mock('./project-files.js', () => ({ projectFilesFor: vi.fn() }));
vi.mock('./controller/file-navigator.js', () => ({ fileNavigatorSearch: vi.fn(), revealFileNavigatorItem: vi.fn() }));
vi.mock('./client-layout.js', () => ({ setClientLayout: vi.fn() }));

const makeController = () =>
  ({
    view: vi.fn(() => []),
    routeView: vi.fn(() => null),
    managers: {
      tab: {
        activeTab: 0,
        launchDir: '/proj',
        findIndex: vi.fn(() => 2),
        setActiveTab: vi.fn(),
      },
      questions: { answer: vi.fn(() => true) },
    },
    dispatch: vi.fn(),
    setActiveTab: vi.fn(),
    closeTab: vi.fn(),
    renameTab: vi.fn(),
    navigatePage: vi.fn(),
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
    fileNavigatorToggle: vi.fn(),
    fileNavigatorCollapseAll: vi.fn(),
    fileNavigatorReroot: vi.fn(),
    moveFileNavigatorItem: vi.fn(),
    deleteFileNavigatorItem: vi.fn(),
    setDock: vi.fn(),
    resetMonitorContext: vi.fn(),
    monitorContextSnapshot: vi.fn(),
    syncEditorBuffer: vi.fn(),
    undoFileNavigatorItem: vi.fn(() => ({})),
    redoFileNavigatorItem: vi.fn(() => ({})),
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

  it('focuses a tab by label', () => {
    const controller = makeController();
    dispatchCall(controller, 32, { method: 'focusTab', params: { label: 'build' } });
    expect(controller.managers.tab.findIndex).toHaveBeenCalledWith('build');
    expect(controller.managers.tab.setActiveTab).toHaveBeenCalledWith(2);
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

  it('routes undoFileNavigatorItem and replies with its result', () => {
    const controller = makeController();
    (controller.undoFileNavigatorItem as ReturnType<typeof vi.fn>).mockReturnValue({ conflict: { fromRelPath: 'a', toRelPath: 'b' } });
    const replies = dispatchCall(controller, 25, { method: 'undoFileNavigatorItem', params: { index: 0, overwrite: true } });
    expect(controller.undoFileNavigatorItem).toHaveBeenCalledWith(0, true);
    expect(replies).toEqual([{ t: 'rpc-reply', id: 25, result: { conflict: { fromRelPath: 'a', toRelPath: 'b' } } }]);
  });

  it('routes redoFileNavigatorItem and replies with its result', () => {
    const controller = makeController();
    (controller.redoFileNavigatorItem as ReturnType<typeof vi.fn>).mockReturnValue({});
    const replies = dispatchCall(controller, 26, { method: 'redoFileNavigatorItem', params: { index: 0 } });
    expect(controller.redoFileNavigatorItem).toHaveBeenCalledWith(0, undefined);
    expect(replies).toEqual([{ t: 'rpc-reply', id: 26, result: {} }]);
  });

  it('routes openFileNavigatorFor', () => {
    const controller = makeController();
    dispatchCall(controller, 27, { method: 'openFileNavigatorFor', params: { label: 'janus' } });
    expect(controller.openFileNavigatorFor).toHaveBeenCalledWith('janus');
  });

  it('routes answerQuestion through the question registry', () => {
    const controller = makeController();
    dispatchCall(controller, 31, {
      method: 'answerQuestion',
      params: { tab: 'janus', id: 'question-1', answer: 'Yes' },
    });
    expect(controller.managers.questions.answer).toHaveBeenCalledWith('janus', 'question-1', 'Yes');
  });

  it('routes openTranscriptFor to controller-transcript.js with the controller\'s managers', () => {
    const controller = makeController();
    dispatchCall(controller, 28, { method: 'openTranscriptFor', params: { label: 'janus' } });
    expect(openTranscriptFor).toHaveBeenCalledWith(controller.managers, 'janus');
  });

  it('routes openAcpTranscript to controller-transcript.js with the controller\'s managers', () => {
    const controller = makeController();
    dispatchCall(controller, 29, { method: 'openAcpTranscript', params: { acpRef: { scope: 'tab', label: 'janus' } } });
    expect(openAcpTranscript).toHaveBeenCalledWith(controller.managers, { scope: 'tab', label: 'janus' });
  });

  it('routes reportLayout straight to client-layout.js', () => {
    const controller = makeController();
    dispatchCall(controller, 30, { method: 'reportLayout', params: { sidebarLeft: 320, sidebarRight: 280, tabAreaPct: 70 } });
    expect(setClientLayout).toHaveBeenCalledWith({ sidebarLeft: 320, sidebarRight: 280, tabAreaPct: 70 });
  });

  it('routes projectFiles to a deferred reply carrying the resolved root and paths', async () => {
    const controller = makeController();
    (projectFilesFor as ReturnType<typeof vi.fn>).mockResolvedValue({ root: '/proj', paths: ['a.ts', 'b.ts'] });
    const replies: ServerEvent[] = [];
    handle(controller, { t: 'rpc', id: 29, method: 'projectFiles', params: {} } as ClientMessage, (event) => { replies.push(event); });
    expect(replies).toEqual([]);
    await vi.waitFor(() => expect(replies).toHaveLength(1));
    expect(replies).toEqual([{ t: 'rpc-reply', id: 29, result: { root: '/proj', paths: ['a.ts', 'b.ts'] } }]);
  });

  it('replies with an empty paths list — never leaving the request pending — when the listing rejects', async () => {
    const controller = makeController();
    (projectFilesFor as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
    const replies: ServerEvent[] = [];
    handle(controller, { t: 'rpc', id: 30, method: 'projectFiles', params: {} } as ClientMessage, (event) => { replies.push(event); });
    await vi.waitFor(() => expect(replies).toHaveLength(1));
    expect(replies).toEqual([{ t: 'rpc-reply', id: 30, result: { root: '/proj', paths: [] } }]);
  });

  it('routes fileNavigatorSearch to a deferred reply carrying the resolved paths', async () => {
    const controller = makeController();
    (fileNavigatorSearch as ReturnType<typeof vi.fn>).mockResolvedValue(['a.ts', 'b.ts']);
    const replies: ServerEvent[] = [];
    handle(controller, { t: 'rpc', id: 31, method: 'fileNavigatorSearch', params: { index: 0 } } as ClientMessage, (event) => { replies.push(event); });
    expect(replies).toEqual([]);
    await vi.waitFor(() => expect(replies).toHaveLength(1));
    expect(fileNavigatorSearch).toHaveBeenCalledWith(controller.managers, 0);
    expect(replies).toEqual([{ t: 'rpc-reply', id: 31, result: { paths: ['a.ts', 'b.ts'] } }]);
  });

  it('replies with an empty paths list for fileNavigatorSearch — never leaving the request pending — when the listing rejects', async () => {
    const controller = makeController();
    (fileNavigatorSearch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
    const replies: ServerEvent[] = [];
    handle(controller, { t: 'rpc', id: 32, method: 'fileNavigatorSearch', params: { index: 0 } } as ClientMessage, (event) => { replies.push(event); });
    await vi.waitFor(() => expect(replies).toHaveLength(1));
    expect(replies).toEqual([{ t: 'rpc-reply', id: 32, result: { paths: [] } }]);
  });

  it('routes revealFileNavigatorItem to controller-file-navigator.js with the controller\'s managers', () => {
    const controller = makeController();
    dispatchCall(controller, 33, { method: 'revealFileNavigatorItem', params: { index: 0, relPath: 'src/a.ts' } });
    expect(revealFileNavigatorItem).toHaveBeenCalledWith(controller.managers, 0, 'src/a.ts');
  });
});
