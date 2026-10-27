import type { Token } from '../command/quoted-token.js';
import type { TabArrangement } from '../tab/arrange.js';
import { readToken, skipSpaces } from '../command/quoted-token.js';
import { isValidGroupSelector } from '../tab/groups.js';

export const TAB_SUBCOMMANDS = ['focus', 'move', 'pane', 'split', 'color', 'group', 'dock', 'undock'] as const;

const SUMMARY_USAGE = String.raw`Usage: tab focus|move|pane|split|color|group|dock|undock \<tab\> [argument].`;
const USAGE: Record<(typeof TAB_SUBCOMMANDS)[number], string> = {
  focus: String.raw`Usage: tab focus \<name\>.`,
  move: String.raw`Usage: tab move \<tab\> \<position\>.`,
  pane: String.raw`Usage: tab pane \<tab\> left|right.`,
  split: String.raw`Usage: tab split \<tab\>.`,
  color: String.raw`Usage: tab color \<tab\> \<#rrggbb\>.`,
  group: String.raw`Usage: tab group \<tab\> \<id|name\>.`,
  dock: String.raw`Usage: tab dock \<tab\> left|right.`,
  undock: String.raw`Usage: tab undock \<tab\>.`,
};

export type ParsedTabCommand =
  | { kind: 'focus'; name: string }
  | { target: string; change: TabArrangement }
  | { error: string };

type ReadWords = { tokens: Token[]; malformed: boolean };
type TabSubcommand = (typeof TAB_SUBCOMMANDS)[number];

function isTabSubcommand(value: string | undefined): value is TabSubcommand {
  return TAB_SUBCOMMANDS.includes(value as TabSubcommand);
}

function readWords(input: string): ReadWords {
  const tokens: Token[] = [];
  let index = 0;
  while (index < input.length) {
    index = skipSpaces(input, index);
    if (index === input.length) break;
    const token = readToken(input, index);
    if (!token) return { tokens, malformed: true };
    tokens.push(token);
    index = token.end;
  }
  return { tokens, malformed: false };
}

function usage(subcommand: string | undefined): ParsedTabCommand {
  return { error: isTabSubcommand(subcommand)
    ? USAGE[subcommand]
    : SUMMARY_USAGE };
}

function parseMove(target: string, argument: string | undefined): ParsedTabCommand {
  if (!argument || !/^\d+$/u.test(argument)) return usage('move');
  const position = Number(argument);
  return Number.isSafeInteger(position) && position > 0
    ? { target, change: { kind: 'move', position } }
    : usage('move');
}

function parseSide(subcommand: 'pane' | 'dock', target: string, argument: string | undefined): ParsedTabCommand {
  const side = argument?.toLowerCase();
  if (side === 'left') return { target, change: subcommand === 'pane' ? { kind: 'pane', side } : { kind: 'dock', side } };
  if (side === 'right') return { target, change: subcommand === 'pane' ? { kind: 'pane', side } : { kind: 'dock', side } };
  return usage(subcommand);
}

function parseColor(target: string, argument: string | undefined): ParsedTabCommand {
  return argument && /^#[\da-f]{6}$/iu.test(argument)
    ? { target, change: { kind: 'color', color: argument } }
    : usage('color');
}

function parseGroup(target: string, argument: string | undefined): ParsedTabCommand {
  return argument && isValidGroupSelector(argument)
    ? { target, change: { kind: 'group', selector: argument } }
    : usage('group');
}

function parseChange(subcommand: TabSubcommand, target: string, argument?: string): ParsedTabCommand {
  switch (subcommand) {
    case 'focus': { return { kind: 'focus', name: target }; }
    case 'move': { return parseMove(target, argument); }
    case 'pane':
    case 'dock': { return parseSide(subcommand, target, argument); }
    case 'split': { return { target, change: { kind: 'split' } }; }
    case 'color': { return parseColor(target, argument); }
    case 'group': { return parseGroup(target, argument); }
    case 'undock': { return { target, change: { kind: 'undock' } }; }
  }
}

export function parseTabCommand(input: string): ParsedTabCommand {
  const { tokens, malformed } = readWords(input);
  const words = tokens.map(({ value }) => value);
  if (words[0]?.toLowerCase() !== 'tab') return { error: SUMMARY_USAGE };
  const subcommand = words[1]?.toLowerCase();
  if (!isTabSubcommand(subcommand)) return { error: SUMMARY_USAGE };
  const command = subcommand;
  if (malformed) return usage(command);
  const expectedLength = ['focus', 'split', 'undock'].includes(command) ? 3 : 4;
  if (words.length !== expectedLength) return usage(command);
  const target = words[2];
  if (!target) return usage(command);
  if (command === 'focus') return { kind: 'focus', name: target };
  return parseChange(command, target, words[3]);
}
