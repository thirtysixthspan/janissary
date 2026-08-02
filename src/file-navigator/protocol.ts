export type FileOpenerChoice = { label: string; command: 'edit' | 'open external' };
export type FileOpenerResolution = { command?: 'open' | 'edit' | 'open external'; choices: FileOpenerChoice[] };
export type BulkConflictPolicy = 'overwrite-all' | 'skip-conflicts';
export type BatchResult = { total: number; failedPaths: string[] };
export type BulkMoveResult = BatchResult | { conflictPaths: string[] };
export type MoveConflict = { fromRelPath: string; toRelPath: string };
export type UndoRedoResult = Partial<BatchResult> & {
  conflict?: MoveConflict;
  conflicts?: MoveConflict[];
};

export type FileNavigatorSelectionRecord = {
  index: number;
  cursor?: string;
  anchor?: string;
  selected: string[];
};
