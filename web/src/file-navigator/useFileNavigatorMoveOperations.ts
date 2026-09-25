import { useState } from 'react';
import type { BulkConflictPolicy, BulkMoveResult, UndoRedoResult } from '@shared/protocol';
import type { JanusClient } from '../ws';
import { basename } from '../shared/rel-path';

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
    // No answer, so nothing moved and there is no conflict report to act on: dismiss the dialog and
    // leave the tree as it stands, rather than reading a field off a result that is not there.
    if (!result.ok) { setPendingConflict(null); return; }
    if ('conflictPaths' in result.value) {
      setPendingConflict({ kind: 'batch-move', sourcePaths, destinationPath, title });
      return;
    }
    setPendingConflict(null);
  };

  const askToOverwrite = (fromRelPath: string, toRelPath: string) => {
    setPendingConflict({
      kind: 'scalar',
      fromRelPath,
      toRelPath,
      source: 'move',
      title: `"${basename(fromRelPath)}" already exists here. Overwrite it?`,
    });
  };

  // Sent without `overwrite`, so the server refuses an occupied destination instead of replacing
  // it — including one inside a collapsed folder whose rows the client never loaded — and its
  // conflict answer opens the same dialog a visible conflict does.
  const sendScalarMove = async (fromRelPath: string, toRelPath: string) => {
    const result = await client.request<BulkMoveResult>({
      method: 'moveFileNavigatorItem',
      params: { index, fromRelPath, toRelPath },
    });
    if (result.ok && 'conflictPaths' in result.value) askToOverwrite(fromRelPath, toRelPath);
  };

  const requestMove = (
    sourcePaths: string[],
    destinationPath: string,
    folderName: string,
    clientConflict: boolean,
  ) => {
    if (sourcePaths.length === 1) {
      if (clientConflict) askToOverwrite(sourcePaths[0], destinationPath);
      else void sendScalarMove(sourcePaths[0], destinationPath);
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
    if (!result.ok) { setPendingConflict(null); return; }
    const source = method === 'undoFileNavigatorItem' ? 'undo' : 'redo';
    if (result.value.conflict) {
      const name = basename(result.value.conflict.fromRelPath);
      setPendingConflict({
        kind: 'scalar',
        ...result.value.conflict,
        source,
        title: `"${name}" already exists here. Overwrite it?`,
      });
    } else if (result.value.conflicts) {
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
          overwrite: true,
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
