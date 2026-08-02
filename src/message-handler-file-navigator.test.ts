import { describe, it, expect, vi } from 'vitest';
import { handleFileNavigatorMessage } from './message-handler-file-navigator.js';
import type { Controller } from './controller.js';
import type { ClientMessage, ServerEvent } from './protocol.js';

const makeController = () =>
  ({
    managers: {},
    reportFileNavigatorSelection: vi.fn(),
    renameFileNavigatorItem: vi.fn(),
    pasteFileNavigatorItems: vi.fn(() => ({ total: 0, failedPaths: [] })),
    fileNavigatorOpeners: vi.fn(() => ({ choices: [] })),
  }) as unknown as Controller;

const dispatch = (controller: Controller, id: number, call: Omit<ClientMessage, 't' | 'id'>) => {
  const replies: ServerEvent[] = [];
  handleFileNavigatorMessage(controller, { t: 'rpc', id, ...call } as ClientMessage & { method: string }, (event) => {
    replies.push(event);
  });
  return replies;
};

describe('handleFileNavigatorMessage', () => {
  it('routes reportFileNavigatorSelection through the controller façade', () => {
    const controller = makeController();
    const navigators = [{ index: 2, cursor: 'src/a.ts', anchor: 'src', selected: ['src', 'src/a.ts'] }];

    const replies = dispatch(controller, 7, { method: 'reportFileNavigatorSelection', params: { id: 4, navigators } });

    expect(controller.reportFileNavigatorSelection).toHaveBeenCalledWith(4, navigators);
    expect(replies).toEqual([{ t: 'rpc-reply', id: 7, result: 'ok' }]);
  });

  it('routes renameFileNavigatorItem through the controller façade and acknowledges', () => {
    const controller = makeController();
    const replies = dispatch(controller, 1, {
      method: 'renameFileNavigatorItem',
      params: { index: 0, relPath: 'src/a.ts', newName: 'b.ts' },
    });
    expect(controller.renameFileNavigatorItem).toHaveBeenCalledWith(0, 'src/a.ts', 'b.ts');
    expect(replies).toEqual([{ t: 'rpc-reply', id: 1, result: 'ok' }]);
  });

  it('routes pasteFileNavigatorItems through the deferred rpc-reply path with the batch result', () => {
    const controller = makeController();
    (controller.pasteFileNavigatorItems as ReturnType<typeof vi.fn>).mockReturnValue({ total: 1, failedPaths: [] });
    const replies = dispatch(controller, 3, {
      method: 'pasteFileNavigatorItems',
      params: { index: 0, sources: ['/a/b.txt'], destinationPath: 'dest', mode: 'copy' },
    });
    expect(controller.pasteFileNavigatorItems).toHaveBeenCalledWith(0, ['/a/b.txt'], 'dest', 'copy', undefined);
    expect(replies).toEqual([{ t: 'rpc-reply', id: 3, result: { total: 1, failedPaths: [] } }]);
  });

  it('routes fileNavigatorOpeners through the controller façade and replies with its result', () => {
    const controller = makeController();
    (controller.fileNavigatorOpeners as ReturnType<typeof vi.fn>).mockReturnValue({ command: 'edit', choices: [] });
    const replies = dispatch(controller, 2, {
      method: 'fileNavigatorOpeners',
      params: { index: 0, relPath: 'src/a.ts', edit: true },
    });
    expect(controller.fileNavigatorOpeners).toHaveBeenCalledWith(0, 'src/a.ts', true);
    expect(replies).toEqual([{ t: 'rpc-reply', id: 2, result: { command: 'edit', choices: [] } }]);
  });
});
