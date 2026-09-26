import { describe, it, expect, vi } from 'vitest';
import { dispatchFileNavigatorMessage } from './file-navigator.js';
import type { Controller } from '../controller.js';
import type { ClientMessage } from '../protocol.js';

const makeController = () =>
  ({
    managers: {},
    reportFileNavigatorSelection: vi.fn(),
    renameFileNavigatorItem: vi.fn(),
    pasteFileNavigatorItems: vi.fn(() => ({ total: 0, failedPaths: [] })),
    fileNavigatorOpeners: vi.fn(() => ({ choices: [] })),
  }) as unknown as Controller;

const dispatch = (controller: Controller, id: number, call: Omit<ClientMessage, 't' | 'id'>) => {
  return dispatchFileNavigatorMessage(
    controller,
    { t: 'rpc', id, ...call } as ClientMessage & { method: string },
  );
};

describe('dispatchFileNavigatorMessage', () => {
  it('routes reportFileNavigatorSelection through the controller façade', () => {
    const controller = makeController();
    const navigators = [{ index: 2, cursor: 'src/a.ts', anchor: 'src', selected: ['src', 'src/a.ts'] }];

    const result = dispatch(controller, 7, { method: 'reportFileNavigatorSelection', params: { id: 4, navigators } });

    expect(controller.reportFileNavigatorSelection).toHaveBeenCalledWith(4, navigators);
    expect(result).toBeUndefined();
  });

  it('routes renameFileNavigatorItem through the controller façade and acknowledges', () => {
    const controller = makeController();
    const result = dispatch(controller, 1, {
      method: 'renameFileNavigatorItem',
      params: { label: 'files', relPath: 'src/a.ts', newName: 'b.ts' },
    });
    expect(controller.renameFileNavigatorItem).toHaveBeenCalledWith('files', 'src/a.ts', 'b.ts');
    expect(result).toBeUndefined();
  });

  it('routes pasteFileNavigatorItems through the deferred rpc-reply path with the batch result', () => {
    const controller = makeController();
    (controller.pasteFileNavigatorItems as ReturnType<typeof vi.fn>).mockReturnValue({ total: 1, failedPaths: [] });
    const result = dispatch(controller, 3, {
      method: 'pasteFileNavigatorItems',
      params: { label: 'files', sources: ['/a/b.txt'], destinationPath: 'dest', mode: 'copy' },
    });
    expect(controller.pasteFileNavigatorItems).toHaveBeenCalledWith('files', ['/a/b.txt'], 'dest', 'copy', undefined);
    expect(result).toEqual({ total: 1, failedPaths: [] });
  });

  it('routes fileNavigatorOpeners through the controller façade and replies with its result', () => {
    const controller = makeController();
    (controller.fileNavigatorOpeners as ReturnType<typeof vi.fn>).mockReturnValue({ command: 'edit', choices: [] });
    const result = dispatch(controller, 2, {
      method: 'fileNavigatorOpeners',
      params: { index: 0, relPath: 'src/a.ts', edit: true },
    });
    expect(controller.fileNavigatorOpeners).toHaveBeenCalledWith(0, 'src/a.ts', true, undefined);
    expect(result).toEqual({ command: 'edit', choices: [] });
  });
});

// A controller whose every method is a recorder, so a case can be checked for the call it makes
// without stubbing a result the case is not about. Kept separate from the stub above, which exists
// to give four particular methods a return value.
function makeRecording() {
  const record = vi.fn();
  const controller = {
    managers: {},
    fileNavigatorSetDetail: record,
    fileNavigatorOpen: record,
    fileNavigatorCreateFile: record,
    fileNavigatorCreateDirectory: record,
    fileNavigatorSelectionAction: record,
    runFileNavigatorSelectionAction: record,
    pasteFileNavigatorItems: record,
  } as unknown as Controller;
  return { controller, record };
}

describe('dispatchFileNavigatorMessage cases with no answer', () => {
  it('routes fileNavigatorSetDetail and acknowledges', () => {
    const { controller, record } = makeRecording();
    const result = dispatch(controller, 1, {
      method: 'fileNavigatorSetDetail',
      params: { index: 3, details: { open: false } },
    });
    expect(record).toHaveBeenCalledExactlyOnceWith(3, { open: false });
    expect(result).toBeUndefined();
  });

  it('routes runFileNavigatorSelectionAction and acknowledges', () => {
    // Fire-and-forget: what the action produces is the plugin's own tab, not a reply.
    const { controller, record } = makeRecording();
    const result = dispatch(controller, 1, {
      method: 'runFileNavigatorSelectionAction',
      params: { index: 2, paths: ['a.mp3'], action: 'queue' },
    });
    expect(record).toHaveBeenCalledExactlyOnceWith(2, ['a.mp3'], 'queue');
    expect(result).toBeUndefined();
  });
});

describe('dispatchFileNavigatorMessage cases that reply', () => {
  it('replies with the opener resolution fileNavigatorOpen produced', () => {
    const { controller, record } = makeRecording();
    record.mockReturnValue('files-1:3');
    const result = dispatch(controller, 1, {
      method: 'fileNavigatorOpen',
      params: { index: 3, relPath: 'src/a.ts', command: 'edit' },
    });
    expect(record).toHaveBeenCalledExactlyOnceWith(3, 'src/a.ts', 'edit');
    expect(result).toBe('files-1:3');
  });

  it('replies with the path fileNavigatorCreateFile produced', () => {
    const { controller, record } = makeRecording();
    record.mockReturnValue('src/new.ts');
    const result = dispatch(controller, 1, {
      method: 'fileNavigatorCreateFile',
      params: { label: 'files-1', destination: 'src/new.ts' },
    });
    expect(record).toHaveBeenCalledExactlyOnceWith('files-1', 'src/new.ts');
    expect(result).toBe('src/new.ts');
  });

  it('replies with the path fileNavigatorCreateDirectory produced', () => {
    const { controller, record } = makeRecording();
    record.mockReturnValue('src/new');
    const result = dispatch(controller, 1, {
      method: 'fileNavigatorCreateDirectory',
      params: { label: 'files-1', destination: 'src/new' },
    });
    expect(record).toHaveBeenCalledExactlyOnceWith('files-1', 'src/new');
    expect(result).toBe('src/new');
  });

  it('replies with the selection action, or with null when none applies', () => {
    const offered = makeRecording();
    offered.record.mockReturnValue({ label: 'Add to playlist', action: 'queue' });
    expect(dispatch(offered.controller, 1, {
      method: 'fileNavigatorSelectionAction',
      params: { index: 0, paths: ['a.mp3'] },
    })).toEqual({ label: 'Add to playlist', action: 'queue' });
    expect(offered.record).toHaveBeenCalledExactlyOnceWith(0, ['a.mp3']);

    const none = makeRecording();
    none.record.mockReturnValue(null);
    expect(dispatch(none.controller, 1, {
      method: 'fileNavigatorSelectionAction',
      params: { index: 0, paths: [] },
    })).toBeNull();
  });

  // A paste carries the host it came from only when it crossed machines, so the short call is the
  // common case and the six-argument one is the exception — both have to reach the same controller
  // method, or a remote paste would be treated as a local one.
  it('carries the source host through only when the paste crossed machines', () => {
    const local = makeRecording();
    dispatch(local.controller, 1, {
      method: 'pasteFileNavigatorItems',
      params: { label: 'files-1', sources: ['/a/b.txt'], destinationPath: 'dest', mode: 'copy' },
    });
    expect(local.record.mock.calls[0]).toHaveLength(5);

    const remote = makeRecording();
    dispatch(remote.controller, 1, {
      method: 'pasteFileNavigatorItems',
      params: {
        label: 'files-1', sources: ['/a/b.txt'], destinationPath: 'dest', mode: 'cut',
        policy: 'overwrite-all', sourceHost: 'devbox',
      },
    });
    expect(remote.record).toHaveBeenCalledExactlyOnceWith(
      'files-1', ['/a/b.txt'], 'dest', 'cut', 'overwrite-all', 'devbox',
    );
  });
});
