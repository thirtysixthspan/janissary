export function truncateTabLabel(name: string, maxLength: number): string {
  if (name.length <= maxLength) return name;
  if (maxLength <= 0) return '';
  if (maxLength === 1) return '…';
  return `${name.slice(0, maxLength - 1)}…`;
}
