import { normalizeCommandName } from '../shared/command-matching.js';
import type { CommandSetting } from './settings-types.js';


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function orderedKeys(text: string): string[] {
  const keys: string[] = [];
  let depth = 0;
  let expectingKey = true;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    switch (character) {
      case '"': {
        const start = index;
        index += 1;
        while (index < text.length) {
          if (text[index] === '\\') index += 2;
          else if (text[index] === '"') break;
          else index += 1;
        }
        if (depth === 1 && expectingKey) {
          const key: unknown = JSON.parse(text.slice(start, index + 1));
          if (typeof key === 'string') keys.push(key);
          expectingKey = false;
        }
        break;
      }
      case '{':
      case '[': {
        depth += 1;
        break;
      }
      case '}':
      case ']': {
        depth -= 1;
        break;
      }
      case ',': {
        if (depth === 1) expectingKey = true;
        break;
      }
    }
  }
  return keys;
}

export type DecodedSettings = Readonly<{ values: Record<string, CommandSetting>; malformed: boolean }>;

export function decodeCommandSettings(parsed: unknown, text: string): DecodedSettings | undefined {
  if (!isRecord(parsed)) return undefined;
  const values = new Map<string, CommandSetting>();
  let malformed = false;
  for (const originalName of orderedKeys(text)) {
    const name = normalizeCommandName(originalName);
    const entry = parsed[originalName];
    if (!name || !isRecord(entry)
      || (entry.enabled !== undefined && typeof entry.enabled !== 'boolean')
      || (entry.agentAccess !== undefined && typeof entry.agentAccess !== 'boolean')) {
      malformed = true;
      if (name) values.set(name, { enabled: true, agentAccess: true });
      continue;
    }
    values.set(name, {
      enabled: entry.enabled ?? true,
      agentAccess: entry.agentAccess ?? true,
    });
  }
  return { values: Object.fromEntries(values), malformed };
}
