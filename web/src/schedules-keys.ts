// Pure selection arithmetic for the schedules tab's keyboard navigation, kept separate from
// SchedulesTab.tsx so it's unit-testable without rendering and to keep that file under the
// 200-line limit. Mirrors handleFileTreeKey's clamp (non-wrapping) semantics.
export function nextSelection(length: number, selected: number | null, key: string): number | null {
  if (length === 0) return null;
  const index = selected ?? 0;
  if (key === 'ArrowDown') return Math.min(index + 1, length - 1);
  if (key === 'ArrowUp') return Math.max(index - 1, 0);
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  return selected;
}
