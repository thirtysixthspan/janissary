import type { HistoryStep } from './moves.js';

type PathMapper = (path: string) => Promise<string>;

export async function mapRemoteHistory(
  history: HistoryStep[], mapPath: PathMapper,
): Promise<HistoryStep[]> {
  return Promise.all(history.map(async (step) => 'entries' in step
    ? { entries: await Promise.all(step.entries.map(async (entry) => ({
      from: await mapPath(entry.from), to: await mapPath(entry.to),
    }))) }
    : step));
}
