import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type {
  BulkMoveResult,
  FileNavigatorMutationResults,
  RenameFileNavigatorResult,
  UndoRedoResult,
} from '@shared/protocol';
import type { RequestResult } from '../rpc-exchange';
import type { JanusClient } from '../ws';
import { requestFileNavigatorMutation } from './file-navigator-request';

describe('requestFileNavigatorMutation', () => {
  it('preserves the method-specific reply contract through the client request', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, value: {} });
    const client = { request } as unknown as JanusClient;
    const move = requestFileNavigatorMutation(client, {
      method: 'moveFileNavigatorItem', params: { label: 'files', fromRelPath: 'a', toRelPath: 'b' },
    });
    const batchMove = requestFileNavigatorMutation(client, {
      method: 'moveFileNavigatorItems', params: { label: 'files', sourcePaths: ['a'], destinationPath: 'b' },
    });
    const paste = requestFileNavigatorMutation(client, {
      method: 'pasteFileNavigatorItems', params: { label: 'files', sources: ['/a'], destinationPath: 'b', mode: 'copy' },
    });
    const rename = requestFileNavigatorMutation(client, {
      method: 'renameFileNavigatorItem', params: { label: 'files', relPath: 'a', newName: 'b' },
    });
    const undo = requestFileNavigatorMutation(client, {
      method: 'undoFileNavigatorItem', params: { label: 'files' },
    });
    const redo = requestFileNavigatorMutation(client, {
      method: 'redoFileNavigatorItem', params: { label: 'files' },
    });

    expectTypeOf(move).toEqualTypeOf<Promise<RequestResult<FileNavigatorMutationResults['moveFileNavigatorItem']>>>();
    expectTypeOf(batchMove).toEqualTypeOf<Promise<RequestResult<BulkMoveResult>>>();
    expectTypeOf(paste).toEqualTypeOf<Promise<RequestResult<BulkMoveResult>>>();
    expectTypeOf(rename).toEqualTypeOf<Promise<RequestResult<RenameFileNavigatorResult>>>();
    expectTypeOf(undo).toEqualTypeOf<Promise<RequestResult<UndoRedoResult>>>();
    expectTypeOf(redo).toEqualTypeOf<Promise<RequestResult<UndoRedoResult>>>();

    // @ts-expect-error A move RPC cannot claim the unrelated rename result.
    const incorrectReply: Promise<RequestResult<RenameFileNavigatorResult>> = move;
    void incorrectReply;

    await Promise.all([move, batchMove, paste, rename, undo, redo]);
    expect(request).toHaveBeenCalledTimes(6);
  });
});
