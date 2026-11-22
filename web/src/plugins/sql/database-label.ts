export function databaseLabel(databasePath: string): string {
  const segment = databasePath.split('/').at(-1) ?? '';
  return segment.replace(/\.sqlite$/i, '');
}
