import { realpathSync } from 'node:fs';

// realpathSync.native preserves the on-disk case that a case-insensitive volume records, which is the
// one spelling readers, writers and patch views must agree on; the JS fallback folds it instead.
export const canonicalPath = realpathSync.native;

// NFKC folding collapses compatibility aliases before lowercasing, so a Unicode spelling and its
// ASCII equivalent produce the same case-insensitive key.
export function foldCase(value: string): string {
  return value.normalize('NFKC').toLowerCase();
}
