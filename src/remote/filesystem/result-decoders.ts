import { history } from './argument-checks.js';
import type { FileNavigatorEntry } from '../../file-navigator/index.js';
import type { RowStat } from '../../file-navigator/stats.js';
import type { GitMetadata, ReplayResult } from '../../file-navigator/filesystem-port.js';
import type { FileOperationResult } from '../../file-navigator/file-operation-result.js';
import type { MoveOneResult, RenameItemResult } from '../../file-navigator/filesystem.js';
import type { DeleteManyResult, MoveManyResult } from '../../file-navigator/batch.js';
import type { PasteManyResult } from '../../file-navigator/paste.js';
import type { CommitResult } from '../../git/commit.js';
import type { HistoryStep } from '../../file-navigator/moves.js';

export const decodeResult = <R>(check: (value: unknown) => value is R) => (value: unknown): R => {
  if (!check(value)) throw new Error('Invalid remote filesystem operation result.');
  return value;
};

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object'
  && value !== null && !Array.isArray(value);
const strings = (value: unknown): value is string[] => Array.isArray(value)
  && value.every((item: unknown) => typeof item === 'string');
const emptyObject = (value: unknown): value is Record<string, never> => record(value) && Object.keys(value).length === 0;
const result = (value: unknown): value is Record<string, unknown> & { ok: boolean } => record(value) && typeof value.ok === 'boolean';
const batch = (value: unknown): value is Record<string, unknown> => record(value)
  && typeof value.total === 'number' && strings(value.failedPaths);
const pairs = (value: unknown): value is { from: string; to: string }[] => Array.isArray(value)
  && value.every((item: unknown) => record(item) && typeof item.from === 'string' && typeof item.to === 'string');
const historySteps = (value: unknown): value is HistoryStep[] => history(value);
const stats = (value: unknown): value is Record<string, RowStat | null> => record(value)
  && Object.values(value).every((item) => item === null || (record(item)
    && typeof item.size === 'number' && typeof item.modified === 'number' && typeof item.mode === 'number'));
const git = (value: unknown): value is GitMetadata => record(value) && Array.isArray(value.statuses)
  && value.statuses.every((item: unknown) => Array.isArray(item) && typeof item[0] === 'string'
    && ['changed', 'staged', 'conflict'].includes(String(item[1])));

export const resultDecoders = {
  'read-directory': decodeResult<FileNavigatorEntry[]>((value): value is FileNavigatorEntry[] => Array.isArray(value)
    && value.every((item: unknown) => record(item) && typeof item.name === 'string' && typeof item.dir === 'boolean')),
  stat: decodeResult<Record<string, RowStat | null>>(stats),
  watch: decodeResult<Record<string, never>>(emptyObject),
  unwatch: decodeResult<Record<string, never>>(emptyObject),
  git: decodeResult<GitMetadata>(git),
  'git-pull': decodeResult<string>((value): value is string => typeof value === 'string'),
  'git-commit': decodeResult<CommitResult>((value): value is CommitResult => record(value)
    && (value.committed === false || (value.committed === true && typeof value.summary === 'string'))),
  search: decodeResult<string[]>(strings),
  'read-file': decodeResult<{ content: string }>((value): value is { content: string } => record(value) && typeof value.content === 'string'),
  'write-file': decodeResult<FileOperationResult>((value): value is FileOperationResult => result(value)
    && (value.ok ? !Object.hasOwn(value, 'value') || value.value === undefined : typeof value.reason === 'string')),
  move: decodeResult<MoveOneResult>((value): value is MoveOneResult => result(value)
    ? (value.ok ? record(value.value) && typeof value.value.from === 'string' && typeof value.value.to === 'string' : typeof value.reason === 'string')
    : record(value) && strings(value.conflictPaths)),
  'move-many': decodeResult<MoveManyResult>((value): value is MoveManyResult => record(value)
    && (strings(value.conflictPaths) || (batch(value) && pairs(value.moved) && typeof value.mutated === 'boolean'))),
  delete: decodeResult<FileOperationResult>((value): value is FileOperationResult => result(value)
    && (value.ok ? !Object.hasOwn(value, 'value') || value.value === undefined : typeof value.reason === 'string')),
  'delete-many': decodeResult<DeleteManyResult>((value): value is DeleteManyResult => batch(value) && typeof value.mutated === 'boolean'),
  rename: decodeResult<RenameItemResult>((value): value is RenameItemResult => record(value)
    && (value.conflict === true || (result(value) && (value.ok
      ? Array.isArray(value.value) && value.value.every((part: unknown) => typeof part === 'string')
      : typeof value.reason === 'string')))),
  paste: decodeResult<PasteManyResult>((value): value is PasteManyResult => record(value)
    && (strings(value.conflictPaths) || (batch(value) && pairs(value.pairs) && typeof value.mutated === 'boolean'))),
  'create-file': decodeResult<FileOperationResult<{ path: string }>>((value): value is FileOperationResult<{ path: string }> => result(value)
    && (value.ok ? record(value.value) && typeof value.value.path === 'string' : typeof value.reason === 'string')),
  'create-directory': decodeResult<FileOperationResult<{ path: string }>>((value): value is FileOperationResult<{ path: string }> => result(value)
    && (value.ok ? record(value.value) && typeof value.value.path === 'string' : typeof value.reason === 'string')),
  replay: decodeResult<ReplayResult>((value): value is ReplayResult => record(value) && record(value.result)
    && Array.isArray(value.undoStack) && historySteps(value.undoStack)
    && Array.isArray(value.redoStack) && historySteps(value.redoStack) && typeof value.mutated === 'boolean'),
};
