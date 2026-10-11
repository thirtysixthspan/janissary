import type { Role } from './shared.js';

function stringEnd(text: string, start: number): number {
  for (let index = start + 1; index < text.length; index += 1) {
    if (text[index] === '\\') index += 1;
    else if (text[index] === '"') return index;
  }
  return text.length;
}

export function orderedJsonKeys(text: string): string[] {
  const keys = new Set<string>();
  let depth = 0;
  let expectingKey = true;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    switch (character) {
      case '"': {
        const end = stringEnd(text, index);
        if (depth === 1 && expectingKey) {
          const key: unknown = JSON.parse(text.slice(index, end + 1));
          if (typeof key === 'string') keys.add(key);
          expectingKey = false;
        }
        index = end;
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
  return [...keys];
}

export function serializeRoles(roles: readonly Role[]): string {
  if (roles.length === 0) return '{}\n';
  const members = roles.map(({ name, description, entries }) => {
    const value = JSON.stringify({ description, entries }, undefined, 2).replaceAll('\n', '\n  ');
    return `  ${JSON.stringify(name)}: ${value}`;
  });
  return `{\n${members.join(',\n')}\n}\n`;
}
