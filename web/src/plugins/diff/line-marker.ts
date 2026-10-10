import type { DiffLine } from '@shared/plugins/diff/shared';

export function markerOf(kind: DiffLine['kind']): string {
  if (kind === 'added') return '+';
  if (kind === 'removed') return '−';
  return '';
}
