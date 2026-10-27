import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export type HelpPageResult =
  | { kind: 'page'; text: string }
  | { kind: 'missing'; name: string }
  | { kind: 'unreadable' };

export function listHelpPages(directory: string): string[] {
  try {
    return readdirSync(directory)
      .filter((file) => file.endsWith('.md'))
      .map((file) => file.slice(0, -3))
      .toSorted((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

export function readHelpPage(directory: string, query: string): HelpPageResult {
  let pages: string[];
  try {
    pages = readdirSync(directory)
      .filter((file) => file.endsWith('.md'))
      .map((file) => file.slice(0, -3));
  } catch {
    return { kind: 'unreadable' };
  }

  if (!pages.includes('commands')) return { kind: 'unreadable' };
  try {
    readFileSync(path.join(directory, 'commands.md'), 'utf8');
  } catch {
    return { kind: 'unreadable' };
  }

  const name = query.toLowerCase().replaceAll(/\s+/g, ' ').trim().replace(/^\//, '');
  if (!pages.includes(name)) return { kind: 'missing', name };

  try {
    return { kind: 'page', text: readFileSync(path.join(directory, `${name}.md`), 'utf8').trim() };
  } catch {
    return { kind: 'unreadable' };
  }
}
