// Whether a value survives a JSON round trip, walking objects and arrays and refusing a cycle.
// A plugin payload or settings object that fails this could never be broadcast or written to disk,
// so both are checked here rather than at their destination.

// Exported because two capability groups need it and neither should own it: the payload and
// settings guards in `file-capabilities.ts`, and the tab-value guard in `context.ts`. It lives
// apart from both so a plugin module importing it pulls nothing else in.
export function isJsonCompatible(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  const valid = Array.isArray(value)
    ? value.every((item) => isJsonCompatible(item, seen))
    : Object.values(value).every((item) => isJsonCompatible(item, seen));
  seen.delete(value);
  return valid;
}
