export function failureReason(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const firstLine = raw.replaceAll(/\s+/g, ' ').trim().replace(/[.!?;:]+$/, '');
  return firstLine || 'unknown failure';
}

export function pluginFailureMessage(pluginId: string, reason: string): string {
  return `Tab plugin "${pluginId}" disabled: ${failureReason(reason)}.`;
}
