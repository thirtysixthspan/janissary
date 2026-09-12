import { lstatSync } from 'node:fs';
import { failureReasons, type FileOperationResult } from './file-operation-result.js';
import type { BulkConflictPolicy, MoveConflict, UndoRedoResult } from '../protocol.js';

export type ReplayLeg<Item> = {
  item: Item;
  source: string;
  destination: string;
  conflict: MoveConflict;
  failurePath: string;
};

type ReplayOptions<Item, Step> = {
  groupItems: Item[];
  replayItems: Item[];
  fromStack: Step[];
  toStack: Step[];
  policy: BulkConflictPolicy | undefined;
  rebuild: () => void;
  makeStep: (items: Item[]) => Step;
  leg: (item: Item) => ReplayLeg<Item>;
  apply: (leg: ReplayLeg<Item>, overwrite: boolean) => FileOperationResult;
  preflight?: boolean;
};

function exists(absolute: string): boolean {
  try {
    lstatSync(absolute);
    return true;
  } catch {
    return false;
  }
}

function buildReplayResult<Item, Step>(options: ReplayOptions<Item, Step>, failed: Map<Item, string>): UndoRedoResult {
  const failures = options.groupItems.flatMap((item) => {
    const reason = failed.get(item);
    return reason === undefined ? [] : [[options.leg(item).failurePath, reason] as const];
  });
  return {
    total: options.groupItems.length,
    failedPaths: failures.map(([failurePath]) => failurePath),
    ...failureReasons(new Map(failures)),
  };
}

export function applyReplayProtocol<Item, Step>(options: ReplayOptions<Item, Step>): UndoRedoResult {
  const replay = options.replayItems.map((item) => options.leg(item));
  const conflicts = options.preflight === false
    ? []
    : replay
      .filter(({ source, destination }) => source !== destination && exists(destination))
      .map(({ conflict }) => conflict);
  if (conflicts.length > 0 && options.policy === undefined) {
    return options.groupItems.length === 1
      ? { total: 1, failedPaths: [], conflict: conflicts[0] }
      : { total: options.groupItems.length, failedPaths: [], conflicts };
  }

  const conflictSources = new Set(conflicts.map((conflict) => conflict.fromRelPath));
  const successful = new Set<Item>();
  const failed = new Map<Item, string>();
  for (const current of replay) {
    if (options.policy === 'skip-conflicts' && conflictSources.has(current.conflict.fromRelPath)) continue;
    const result = options.apply(current, options.policy === 'overwrite-all');
    if (result.ok) successful.add(current.item);
    else failed.set(current.item, result.reason);
  }

  if (successful.size > 0) {
    options.fromStack.pop();
    const remaining = options.groupItems.filter((item) => !successful.has(item));
    if (remaining.length > 0) options.fromStack.push(options.makeStep(remaining));
    options.toStack.push(options.makeStep(options.groupItems.filter((item) => successful.has(item))));
    options.rebuild();
  }

  return buildReplayResult(options, failed);
}
