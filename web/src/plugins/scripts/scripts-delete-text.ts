export function deleteTitle(name: string): string {
  return `Delete runscript "${name}"?`;
}

export function systemScheduleLine(count: number): string | null {
  if (count < 1) return null;
  if (count === 1) return 'Used by 1 system schedule. It will fire as missing after this.';
  return `Used by ${count} system schedules. They will fire as missing after this.`;
}

export function openEditorLine(open: boolean): string | null {
  return open ? 'Open in an editor tab. The tab keeps its text.' : null;
}
