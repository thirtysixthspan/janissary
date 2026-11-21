// How many statements the console recalls. Long enough to walk back through a session of
// experimenting, short enough that the recall walk stays instant.
export const HISTORY_LIMIT = 50;

export function appendHistory(previous: string[], sql: string, limit: number): string[] {
  return [...previous.filter((entry) => entry !== sql), sql].slice(-limit);
}

export function shouldClearDraft(submittedRevision: number, currentRevision: number): boolean {
  return currentRevision === submittedRevision;
}
