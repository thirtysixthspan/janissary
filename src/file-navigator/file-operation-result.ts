export type FileOperationResult<T = void> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

const ERROR_REASONS: Readonly<Record<string, string>> = {
  EACCES: 'Permission denied; check file and folder permissions, then try again',
  EPERM: 'Permission denied; check file and folder permissions, then try again',
  ENOSPC: 'The disk is full; free some space, then try again',
  EXDEV: 'The source and destination are on different filesystems; copy the item instead',
  ENOENT: 'The source or destination no longer exists; refresh the file navigator, then try again',
  EEXIST: 'The destination already exists; choose overwrite or another name',
  ERR_FS_CP_EEXIST: 'The destination already exists; choose overwrite or another name',
  ENOTEMPTY: 'The destination is not empty; choose overwrite or another name',
  EROFS: 'The destination is read-only; choose a writable location',
};

export const OUTSIDE_ROOT_REASON = 'The path is outside this file navigator; choose an item inside the tree';
export const DESTINATION_UNAVAILABLE_REASON = 'The destination is unavailable; refresh the file navigator and choose an existing folder';
export const SOURCE_UNAVAILABLE_REASON = 'The source is unavailable; refresh the file navigator, then try again';
export const DUPLICATE_NAME_REASON = 'Another selected item has the same name; move it separately or rename one item first';
export const DESCENDANT_DESTINATION_REASON = 'A folder cannot be moved inside itself; choose another destination';
export const INVALID_NAME_REASON = 'The name contains a path separator; enter a name without folders';

export function fileOperationReason(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') {
    return ERROR_REASONS[error.code]
      ?? `Filesystem error ${error.code}; check the item and destination, then try again`;
  }
  return 'Filesystem error; check the item and destination, then try again';
}

export function runFileOperation<T>(operation: () => T): FileOperationResult<T> {
  try {
    return { ok: true, value: operation() };
  } catch (error) {
    return { ok: false, reason: fileOperationReason(error) };
  }
}

export function failureResult<T = void>(reason: string): FileOperationResult<T> {
  return { ok: false, reason };
}

export function failureReasons(reasons: Map<string, string>): { failureReasons?: Record<string, string> } {
  return reasons.size === 0 ? {} : { failureReasons: Object.fromEntries(reasons) };
}
