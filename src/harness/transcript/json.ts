// Narrowing helpers for records parsed out of a harness's own on-disk session format. Every value
// arrives as `unknown` (the shapes belong to another program and change between its versions), so
// each adapter reads through these rather than asserting a type it cannot guarantee.

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

// Parse one JSONL line, returning undefined for blank lines and for anything that is not a JSON
// object — a partially flushed or corrupt line is skipped, never thrown.
export function parseRecordLine(line: string): Record<string, unknown> | undefined {
  const trimmed = line.trim();
  if (!trimmed) return undefined;
  try {
    return asRecord(JSON.parse(trimmed));
  } catch {
    return undefined;
  }
}
