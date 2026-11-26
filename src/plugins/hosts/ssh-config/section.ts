import { isLiteralName, tokenizeSshConfig } from './parse.js';

const BEGIN = '# BEGIN janissary hosts';
const END = '# END janissary hosts';
const HEADER = '# Managed by Janissary; edits inside this section are replaced on export.';

type ManagedRange = { start: number; end: number };
type ManagedSections = {
  ranges: ManagedRange[];
  remainingText: string;
  outsideAliases: string[];
};
type SectionHost = { name: string; host: string; user?: string; port?: number };
type SourceLine = { start: number; end: number; content: string };

function readLines(text: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let start = 0;
  while (start < text.length) {
    const newline = text.indexOf('\n', start);
    const end = newline === -1 ? text.length : newline + 1;
    let content = text.slice(start, end);
    if (content.endsWith('\n')) content = content.slice(0, -1);
    if (content.endsWith('\r')) content = content.slice(0, -1);
    lines.push({ start, end, content });
    start = end;
  }
  return lines;
}

function findRanges(text: string): ManagedRange[] {
  const ranges: ManagedRange[] = [];
  let begin: SourceLine | undefined;
  for (const line of readLines(text)) {
    if (line.content === BEGIN) {
      begin ??= line;
    } else if (line.content === END && begin !== undefined) {
      ranges.push({ start: begin.start, end: line.end });
      begin = undefined;
    }
  }
  return ranges;
}

function withoutSections(text: string, ranges: readonly ManagedRange[]): string {
  let remaining = '';
  let cursor = 0;
  for (const range of ranges) {
    remaining += text.slice(cursor, range.start);
    cursor = range.end;
  }
  return remaining + text.slice(cursor);
}

function outsideLiteralAliases(text: string): string[] {
  const aliases: string[] = [];
  const seen = new Set<string>();
  for (const block of tokenizeSshConfig(text)) {
    if (block.kind !== 'host') continue;
    for (const name of block.names) {
      if (!isLiteralName(name)) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      aliases.push(name);
    }
  }
  return aliases;
}

function leadingNewline(before: string): string {
  return before.length > 0 && !before.endsWith('\n') ? '\n' : '';
}

export function findManagedSections(text: string): ManagedSections {
  const ranges = findRanges(text);
  const remainingText = withoutSections(text, ranges);
  return { ranges, remainingText, outsideAliases: outsideLiteralAliases(remainingText) };
}

export function serializeManagedSection(hosts: readonly SectionHost[]): string {
  const ordered = hosts.toSorted((left, right) => {
    const a = left.name.toLowerCase();
    const b = right.name.toLowerCase();
    return a < b ? -1 : a > b ? 1 : 0;
  });
  const lines = [BEGIN, HEADER];
  for (const host of ordered) {
    if (lines.length > 2) lines.push('');
    lines.push(`Host ${host.name}`, `    HostName ${host.host}`);
    if (host.user !== undefined) lines.push(`    User ${host.user}`);
    if (host.port !== undefined) lines.push(`    Port ${host.port}`);
  }
  lines.push(END);
  return `${lines.join('\n')}\n`;
}

export function spliceManagedSection(
  text: string, ranges: readonly ManagedRange[], section: string,
): string {
  if (ranges.length === 0) return `${text}${leadingNewline(text)}${section}`;
  const pieces: string[] = [];
  let cursor = 0;
  for (const [index, range] of ranges.entries()) {
    const before = text.slice(cursor, range.start);
    pieces.push(index === 0 ? before + leadingNewline(before) + section : before);
    cursor = range.end;
  }
  pieces.push(text.slice(cursor));
  return pieces.join('');
}
