export function nextChatSelection(
  length: number,
  selected: number | null,
  key: string,
): number | null {
  if (length === 0) return null;
  const index = selected ?? 0;
  if (key === 'ArrowDown') return Math.min(index + 1, length - 1);
  if (key === 'ArrowUp') return Math.max(index - 1, 0);
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  return selected;
}
