export type SshSetting = { keyword: string; value: string };

export type HostBlock = { kind: 'host'; names: string[]; settings: SshSetting[] };
export type MatchBlock = { kind: 'match'; criteria: string[]; settings: SshSetting[] };
export type SshConfigBlock = HostBlock | MatchBlock;

type LineTokens = { keyword: string; args: string[] };

function isSpace(char: string): boolean {
  return /\s/.test(char);
}

function stripComment(line: string): string {
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index] ?? '';
    if (char === '"') quoted = !quoted;
    else if (char === '#' && !quoted) return line.slice(0, index);
  }
  return line;
}

function readArgs(text: string, start: number): string[] {
  const args: string[] = [];
  let index = start;
  while (index < text.length) {
    while (index < text.length && isSpace(text[index] ?? '')) index++;
    if (index >= text.length) break;
    let value = '';
    let quoted = false;
    while (index < text.length) {
      const char = text[index] ?? '';
      if (char === '"') quoted = !quoted;
      else if (!quoted && isSpace(char)) break;
      else value += char;
      index++;
    }
    args.push(value);
  }
  return args;
}

function tokenizeLine(line: string): LineTokens | undefined {
  const text = stripComment(line);
  let index = 0;
  while (index < text.length && isSpace(text[index] ?? '')) index++;
  const start = index;
  while (index < text.length && !isSpace(text[index] ?? '') && text[index] !== '=') index++;
  const keyword = text.slice(start, index).toLowerCase();
  if (keyword.length === 0) return undefined;
  while (index < text.length && isSpace(text[index] ?? '')) index++;
  if (text[index] === '=') index++;
  return { keyword, args: readArgs(text, index) };
}

export function tokenizeSshConfig(text: string): SshConfigBlock[] {
  const blocks: SshConfigBlock[] = [];
  let current: SshConfigBlock | undefined;
  for (const line of text.split(/\r?\n/)) {
    const tokens = tokenizeLine(line);
    if (tokens === undefined) continue;
    if (tokens.keyword === 'host') {
      current = { kind: 'host', names: tokens.args, settings: [] };
      blocks.push(current);
    } else if (tokens.keyword === 'match') {
      current = { kind: 'match', criteria: tokens.args, settings: [] };
      blocks.push(current);
    } else if (current !== undefined) {
      current.settings.push({ keyword: tokens.keyword, value: tokens.args[0] ?? '' });
    }
  }
  return blocks;
}
