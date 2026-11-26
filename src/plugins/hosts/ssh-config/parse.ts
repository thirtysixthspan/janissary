import { Minimatch } from 'minimatch';
import { isHostPatternTooComplex } from './pattern-limits.js';

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

export type EffectiveAlias = {
  name: string;
  hostName: string;
  user: string;
  port: string;
  invalidToken: string;
};

function isLiteralName(name: string): boolean {
  return name !== '' && !name.includes('*') && !name.includes('?') && !name.startsWith('!');
}

type Pattern = { matcher: Minimatch | undefined; negated: boolean };

function escapeLiteralMetacharacters(pattern: string): string {
  return pattern.replaceAll(/[[\]\\]/g, String.raw`\$&`);
}

function compilePatterns(names: string[]): Pattern[] {
  const patterns: Pattern[] = [];
  for (const name of names) {
    const negated = name.startsWith('!');
    const pattern = negated ? name.slice(1) : name;
    if (isHostPatternTooComplex(pattern)) {
      patterns.push({ matcher: undefined, negated });
      continue;
    }
    patterns.push({
      matcher: new Minimatch(escapeLiteralMetacharacters(pattern), {
        nocase: true,
        dot: true,
        nobrace: true,
        noext: true,
        nonegate: true,
      }),
      negated,
    });
  }
  return patterns;
}

function blockMatches(patterns: Pattern[], alias: string): boolean {
  let positive = false;
  let negative = false;
  for (const pattern of patterns) {
    if (pattern.matcher === undefined) return false;
    if (!pattern.matcher.match(alias)) continue;
    if (pattern.negated) negative = true;
    else positive = true;
  }
  return positive && !negative;
}

function expandValue(value: string, alias: string, hostName: boolean): { value: string; invalidToken: string } {
  let result = '';
  for (let index = 0; index < value.length; index++) {
    const char = value[index] ?? '';
    if (char !== '%') {
      result += char;
      continue;
    }
    const next = value[index + 1] ?? '';
    if (hostName && (next === '%' || next === 'h')) {
      result += next === '%' ? '%' : alias;
      index++;
    } else {
      return { value, invalidToken: next === '' ? '%' : `%${next}` };
    }
  }
  return { value: result, invalidToken: '' };
}

function assignValues(alias: EffectiveAlias, blocks: SshConfigBlock[]): void {
  let hostName: string | undefined;
  let user: string | undefined;
  let port: string | undefined;
  for (const block of blocks) {
    if (block.kind !== 'host' || !blockMatches(compilePatterns(block.names), alias.name)) continue;
    for (const setting of block.settings) {
      switch (setting.keyword) {
        case 'hostname': {
          hostName ??= setting.value;
          break;
        }
        case 'user': {
          user ??= setting.value;
          break;
        }
        case 'port': {
          port ??= setting.value;
          break;
        }
      }
    }
  }
  const expanded = expandValue(hostName ?? '', alias.name, true);
  const userExpanded = expandValue(user ?? '', alias.name, false);
  const portExpanded = expandValue(port ?? '', alias.name, false);
  alias.hostName = expanded.value;
  alias.user = userExpanded.value;
  alias.port = portExpanded.value;
  alias.invalidToken = expanded.invalidToken || userExpanded.invalidToken || portExpanded.invalidToken;
}

export function readEffectiveAliases(text: string): EffectiveAlias[] {
  const blocks = tokenizeSshConfig(text);
  const aliases: EffectiveAlias[] = [];
  const seen = new Set<string>();
  for (const block of blocks) {
    if (block.kind !== 'host') continue;
    for (const name of block.names) {
      const key = name.toLowerCase();
      if (!isLiteralName(name) || seen.has(key)) continue;
      seen.add(key);
      aliases.push({ name, hostName: '', user: '', port: '', invalidToken: '' });
    }
  }
  for (const alias of aliases) {
    assignValues(alias, blocks);
  }
  return aliases;
}
