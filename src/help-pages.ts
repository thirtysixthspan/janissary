import { readdirSync, readFileSync } from 'node:fs';
import { regularHelpPagePath } from './help-page-files.js';

export type HelpPageResult =
  | { kind: 'page'; text: string }
  | { kind: 'missing'; name: string }
  | { kind: 'unreadable' };

function markdownPageNames(directory: string): string[] | null {
  try {
    return readdirSync(directory)
      .filter((file) => file.endsWith('.md'))
      .map((file) => file.slice(0, -3));
  } catch {
    return null;
  }
}

export function listHelpPages(directory: string): string[] {
  const pages = markdownPageNames(directory);
  if (pages === null) return [];
  return pages
    .filter((name) => regularHelpPagePath(directory, `${name}.md`) !== undefined)
    .toSorted((left, right) => left.localeCompare(right));
}

export function readHelpPage(directory: string, query: string): HelpPageResult {
  const pages = markdownPageNames(directory);
  if (pages === null) return { kind: 'unreadable' };

  if (!pages.includes('commands')) return { kind: 'unreadable' };
  const commandsPath = regularHelpPagePath(directory, 'commands.md');
  if (commandsPath === undefined) return { kind: 'unreadable' };
  try {
    readFileSync(commandsPath, 'utf8');
  } catch {
    return { kind: 'unreadable' };
  }

  const name = query.toLowerCase().replaceAll(/\s+/g, ' ').trim().replace(/^\//, '');
  if (!pages.includes(name)) return { kind: 'missing', name };

  const pagePath = regularHelpPagePath(directory, `${name}.md`);
  if (pagePath === undefined) return { kind: 'unreadable' };
  try {
    return { kind: 'page', text: readFileSync(pagePath, 'utf8').trim() };
  } catch {
    return { kind: 'unreadable' };
  }
}
