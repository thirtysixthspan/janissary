// `help <section>` reads its sections out of `help.md` itself rather than from a list kept beside it,
// so a new block added to the help text is reachable by name with no code change. Pure: it takes the
// markdown and returns text, and the caller owns reading and caching the file.

export type HelpSection = { title: string; text: string };

type LocatedSection = HelpSection & { start: number };

const HEADING = /^###\s+(.+)$/;
const BOLD_LABEL = /^\*\*([^*]+)\*\*/;

// Each `###` heading, with everything up to the next one.
function headingSections(lines: string[]): LocatedSection[] {
  const starts = lines.flatMap((line, index) => (HEADING.test(line) ? [index] : []));
  return starts.flatMap((start, position) => {
    const match = HEADING.exec(lines[start]);
    if (!match) return [];
    const end = starts[position + 1] ?? lines.length;
    return [{ start, title: match[1].trim(), text: lines.slice(start, end).join('\n').trim() }];
  });
}

// Each bold-labelled block inside a heading: the label line and the table directly under it. A
// paragraph after the table belongs to the heading's section only, never to the block before it.
function blockSections(lines: string[]): LocatedSection[] {
  return lines.flatMap((line, start) => {
    const match = BOLD_LABEL.exec(line);
    if (!match) return [];
    let end = start + 1;
    while (end < lines.length && lines[end].trim() === '') end += 1;
    const tableStart = end;
    while (end < lines.length && lines[end].startsWith('|')) end += 1;
    if (end === tableStart) return [];
    return [{ start, title: match[1].trim(), text: lines.slice(start, end).join('\n').trim() }];
  });
}

export function parseHelpSections(markdown: string): HelpSection[] {
  const lines = markdown.split('\n');
  return [...headingSections(lines), ...blockSections(lines)]
    .toSorted((left, right) => left.start - right.start)
    .map(({ title, text }) => ({ title, text }));
}

function normalize(text: string): string {
  return text.toLowerCase().replaceAll(/\s+/g, ' ').trim();
}

// Tried in order, and the first rule that matches any section decides; within a rule, the earliest
// section in the document wins. So `commands` is the command table, `shell` the shell tab's keys,
// and `agent` the command bar and agent tab controls.
const MATCH_RULES: ((title: string, query: string) => boolean)[] = [
  (title, query) => title === query,
  (title, query) => title.startsWith(query),
  (title, query) => ` ${title} `.includes(` ${query} `),
];

function noHelpSectionMessage(query: string, sections: HelpSection[]): string {
  return `No help section matches "${query}". Sections: ${sections.map((section) => section.title).join(', ')}.`;
}

export function selectHelpSection(markdown: string, query: string): string {
  const sections = parseHelpSections(markdown);
  const wanted = normalize(query);
  for (const rule of MATCH_RULES) {
    const found = sections.find((section) => rule(normalize(section.title), wanted));
    if (found) return found.text;
  }
  return noHelpSectionMessage(query.trim(), sections);
}
