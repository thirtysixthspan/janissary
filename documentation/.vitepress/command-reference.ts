import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HELP_DIRECTORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'help');
const CHARACTERS = [
  'ahmed', 'aslan', 'bilal', 'cavus', 'demir', 'dogan', 'ekrem', 'fariz', 'hakim',
  'hamza', 'idris', 'mahir', 'malik', 'orhan', 'selim', 'tahir', 'yusuf',
];

export function commandNames(): string[] {
  return readdirSync(HELP_DIRECTORY)
    .filter((file) => file.endsWith('.md') && file !== 'commands.md' && file !== 'keys.md')
    .map((file) => file.slice(0, -3))
    .toSorted((left, right) => left.localeCompare(right));
}

export function commandReferenceSidebar() {
  return {
    text: 'Command Reference',
    collapsed: true,
    items: commandNames().map((name) => ({
      text: `<code>${name}</code>`,
      link: `/user-documentation/command-reference/${name}`,
    })),
  };
}

export function renderCommandPage(name: string): string {
  const index = commandNames().indexOf(name);
  if (index === -1) throw new Error(`No help page named "${name}".`);
  const markdown = readFileSync(path.join(HELP_DIRECTORY, `${name}.md`), 'utf8').trim();
  const heading = `# \`${name}\``;
  const character = CHARACTERS[index % CHARACTERS.length];
  return markdown
    .replace(/^###\s+.+$/m, heading)
    .replace(heading, `${heading}\n\n<img class="agent-float" src="/agents/${character}-south-west.png" alt="" />`);
}

export function helpDirectory(): string {
  return HELP_DIRECTORY;
}
