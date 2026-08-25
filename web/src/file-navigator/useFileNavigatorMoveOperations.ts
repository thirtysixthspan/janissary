import { useState } from 'react';
import type { BulkConflictPolicy, BulkMoveResult, UndoRedoResult } from '@shared/protocol';
import type { JanusClient } from '../ws';
import { basename } from '../rel-path';

type Method = 'undoFileNavigatorItem' | 'redoFileNavigatorItem';
type PendingConflict =
  | {
      kind: 'scalar';
      fromRelPath: string;
      toRelPath: string;
      source: 'move' | 'undo' | 'redo';
      title: string;
    }
  | {
      kind: 'batch-move';
      sourcePaths: string[];
      destinationPath: string;
      title: string;
    }
  | {
      kind: 'history';
      method: Method;
      title: string;
    };

export function useFileNavigatorMoveOperations(client: JanusClient, index: number) {
  const [pendingConflict, setPendingConflict] = useState<PendingConflict | null>(null);

  const sendBatchMove = async (
    sourcePaths: string[],
    destinationPath: string,
    title: string,
    policy?: BulkConflictPolicy,
  ) => {
    const result = await client.request<BulkMoveResult>({
      method: 'moveFileNavigatorItems',
      params: { index, sourcePaths, destinationPath, policy },
    });
    if ('conflictPaths' in result) {
      setPendingConflict({ kind: 'batch-move', sourcePaths, destinationPath, title });
      return;
    }
    setPendingConflict(null);
  };

  const requestMove = (
    sourcePaths: string[],
    destinationPath: string,
    folderName: string,
    clientConflict: boolean,
  ) => {
    if (sourcePaths.length === 1) {
      const fromRelPath = sourcePaths[0];
      if (clientConflict) {
        const name = basename(fromRelPath);
        setPendingConflict({
          kind: 'scalar',
          fromRelPath,
          toRelPath: destinationPath,
          source: 'move',
          title: `"${name}" already exists here. Overwrite it?`,
        });
      } else {
        client.send({
          method: 'moveFileNavigatorItem',
          params: { index, fromRelPath, toRelPath: destinationPath },
        });
      }
      return;
    }
    void sendBatchMove(
      sourcePaths,
      destinationPath,
      `Some items already exist in "${folderName}".`,
    );
  };

  const history = async (method: Method) => {
    const result = await client.request<UndoRedoResult>({ method, params: { index } });
    const source = method === 'undoFileNavigatorItem' ? 'undo' : 'redo';
    if (result.conflict) {
      const name = basename(result.conflict.fromRelPath);
      setPendingConflict({
        kind: 'scalar',
        ...result.conflict,
        source,
        title: `"${name}" already exists here. Overwrite it?`,
      });
    } else if (result.conflicts) {
      setPendingConflict({
        kind: 'history',
        method,
        title: 'Some items already exist in their destinations.',
      });
    }
  };

  const retry = (policy: BulkConflictPolicy) => {
    if (!pendingConflict) return;
    if (pendingConflict.kind === 'batch-move') {
      void sendBatchMove(
        pendingConflict.sourcePaths,
        pendingConflict.destinationPath,
        pendingConflict.title,
        policy,
      );
      return;
    }
    if (pendingConflict.kind === 'history') {
      void client.request<UndoRedoResult>({
        method: pendingConflict.method,
        params: {
          index,
          overwrite: policy === 'overwrite-all' || undefined,
          skipConflicts: policy === 'skip-conflicts' || undefined,
        },
      }).then(() => {
        setPendingConflict(null);
      });
      return;
    }
    if (pendingConflict.source === 'move') {
      client.send({
        method: 'moveFileNavigatorItem',
        params: {
          index,
          fromRelPath: pendingConflict.fromRelPath,
          toRelPath: pendingConflict.toRelPath,
        },
      });
    } else {
      client.send({
        method: pendingConflict.source === 'undo' ? 'undoFileNavigatorItem' : 'redoFileNavigatorItem',
        params: { index, overwrite: true },
      });
    }
    setPendingConflict(null);
  };

  return {
    pendingConflict,
    requestMove,
    sendUndo: () => history('undoFileNavigatorItem'),
    sendRedo: () => history('redoFileNavigatorItem'),
    confirmOverwrite: () => retry('overwrite-all'),
    skipConflicts: () => retry('skip-conflicts'),
    cancelConflict: () => setPendingConflict(null),
  };
}
