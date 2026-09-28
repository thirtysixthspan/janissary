// The shapes a tab's intent may take, and the guards that decide whether one was read.
//
// Split from `shared.ts` because they are about what a tab asks for rather than what it is shown: the
// payload contract is read by the browser on every broadcast, the intents once when a button is pressed.
// Both are import-free — this one carries its own `isRecord` — so a guard here cannot be the reason the
// contract stops being checkable.

export type CreateIntent = { message?: string };
export type IdIntent = { id: string };
export type SendIntent = { query: string };
export type ChartIntent = { chartId: string };
export type ChartRefreshIntent = { chartId: string; seconds: number };

export function isCreateIntent(value: unknown): value is CreateIntent {
  if (!isRecord(value)) return false;
  const message = value.message;
  return message === undefined || (typeof message === 'string' && message.trim() !== '');
}
export function isIdIntent(value: unknown): value is IdIntent {
  return isRecord(value) && typeof value.id === 'string' && value.id !== '';
}
export function isSendIntent(value: unknown): value is SendIntent {
  return isRecord(value) && typeof value.query === 'string' && value.query.trim() !== '';
}
export function isChartIntent(value: unknown): value is ChartIntent {
  return isRecord(value) && typeof value.chartId === 'string' && value.chartId !== '';
}
export function isChartRefreshIntent(value: unknown): value is ChartRefreshIntent {
  return isRecord(value)
    && typeof value.chartId === 'string' && value.chartId !== ''
    && typeof value.seconds === 'number' && Number.isFinite(value.seconds) && value.seconds >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
