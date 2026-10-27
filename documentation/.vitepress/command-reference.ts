import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { regularHelpPagePath } from '../../src/help-page-files.js';

const HELP_DIRECTORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'help');
const CHARACTERS = [
  'ahmed', 'aslan', 'bilal', 'cavus', 'demir', 'dogan', 'ekrem', 'fariz', 'hakim',
  'hamza', 'idris', 'mahir', 'malik', 'orhan', 'selim', 'tahir', 'yusuf',
];

export function commandNames(directory = HELP_DIRECTORY): string[] {
  const resolvedDirectory = realpathSync(directory);
  return readdirSync(resolvedDirectory)
    .filter((file) => file.endsWith('.md') && file !== 'commands.md' && file !== 'keys.md')
    .filter((file) => regularHelpPagePath(resolvedDirectory, file) !== undefined)
    .map((file) => file.slice(0, -3))
    .toSorted((left, right) => left.localeCompare(right));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function commandReferenceSidebar(names = commandNames()) {
  return {
    text: 'Command Reference',
    collapsed: true,
    items: names.map((name) => ({
      text: `<code>${escapeHtml(name)}</code>`,
      link: `/user-documentation/command-reference/${name}`,
    })),
  };
}

export function renderCommandPageContent(name: string, markdown: string, characterIndex: number): string {
  const heading = `# <code>${escapeHtml(name)}</code>`;
  const character = CHARACTERS[characterIndex % CHARACTERS.length];
  return markdown
    .replace(/^###\s+.+$/m, () => heading)
    .replace(heading, () => `${heading}\n\n<img class="agent-float" src="/agents/${character}-south-west.png" alt="" />`);
}

export function renderCommandPage(name: string, directory = HELP_DIRECTORY): string {
  const index = commandNames(directory).indexOf(name);
  if (index === -1) throw new Error(`No help page named "${name}".`);
  const pagePath = regularHelpPagePath(directory, `${name}.md`);
  if (pagePath === undefined) throw new Error(`No help page named "${name}".`);
  const markdown = readFileSync(pagePath, 'utf8').trim();
  return renderCommandPageContent(name, markdown, index);
}

export function helpDirectory(): string {
  return HELP_DIRECTORY;
}
