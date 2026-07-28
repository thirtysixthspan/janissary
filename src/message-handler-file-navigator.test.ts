import { describe, it, expect, vi } from 'vitest';
import { handleFileNavigatorMessage } from './message-handler-file-navigator.js';
import type { Controller } from './controller.js';
import type { ClientMessage, ServerEvent } from './protocol.js';
import { renameFileNavigatorItem, fileNavigatorOpeners } from './controller/file-navigator.js';

vi.mock('./controller/file-navigator.js', () => ({
  deleteFileNavigatorItems: vi.fn(),
  fileNavigatorOpeners: vi.fn(),
  fileNavigatorSearch: vi.fn(),
  moveFileNavigatorItems: vi.fn(),
  renameFileNavigatorItem: vi.fn(),
  revealFileNavigatorItem: vi.fn(),
}));

const makeController = () =>
  ({
    managers: {},
  }) as unknown as Controller;

const dispatch = (controller: Controller, id: number, call: Omit<ClientMessage, 't' | 'id'>) => {
  const replies: ServerEvent[] = [];
  handleFileNavigatorMessage(controller, { t: 'rpc', id, ...call } as ClientMessage & { method: string }, (event) => {
    replies.push(event);
  });
  return replies;
};

describe('handleFileNavigatorMessage', () => {
  it('routes renameFileNavigatorItem to controller-file-navigator.js and acknowledges', () => {
    const controller = makeController();
    const replies = dispatch(controller, 1, {
      method: 'renameFileNavigatorItem',
      params: { index: 0, relPath: 'src/a.ts', newName: 'b.ts' },
    });
    expect(renameFileNavigatorItem).toHaveBeenCalledWith(controller.managers, 0, 'src/a.ts', 'b.ts');
    expect(replies).toEqual([{ t: 'rpc-reply', id: 1, result: 'ok' }]);
  });

  it('routes fileNavigatorOpeners to controller-file-navigator.js and replies with its result', () => {
    const controller = makeController();
    vi.mocked(fileNavigatorOpeners).mockReturnValue({ command: 'edit', choices: [] });
    const replies = dispatch(controller, 2, {
      method: 'fileNavigatorOpeners',
      params: { index: 0, relPath: 'src/a.ts', edit: true },
    });
    expect(fileNavigatorOpeners).toHaveBeenCalledWith(controller.managers, 0, 'src/a.ts', true);
    expect(replies).toEqual([{ t: 'rpc-reply', id: 2, result: { command: 'edit', choices: [] } }]);
  });
});
