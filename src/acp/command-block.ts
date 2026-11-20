// Pure extraction of the commands an ACP agent places in labelled fenced blocks. The reply is
// scanned for every closed ```janissary fence, each of which contributes one command and its
// display span. The three-variant result lets the caller tell a final answer from a batch that
// needs correcting.

import { nativeCommandName } from './native-commands.js';

export type CodeFence = { character: '`' | '~'; length: number };

export function openingFence(line: string): CodeFence | undefined {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  const marker = match?.[1];
  const info = match?.[2] ?? '';
  if (!marker || (marker.startsWith('`') && info.includes('`'))) return undefined;
  return { character: marker.startsWith('`') ? '`' : '~', length: marker.length };
}

export function closesFence(line: string, fence: CodeFence): boolean {
  const marker = /^ {0,3}(`+|~+)[ \t]*$/.exec(line)?.[1];
  return marker !== undefined && marker.startsWith(fence.character) && marker.length >= fence.length;
}

export type CommandBlockSpan = { start: number; end: number };

export type CommandBlockResult =
  | { kind: 'batch'; commands: readonly { command: string; span: CommandBlockSpan }[] }
  | { kind: 'mistake'; commands: number }
  | { kind: 'absent' };

type BlockResult = Exclude<CommandBlockResult, { kind: 'absent' }>;

type ReplyLine = { text: string; start: number; end: number };
type Candidate = { open: number; close: number };
type Candidates = { closed: Candidate[]; unclosedLabelled: boolean };

const LABEL = 'janissary';
const JANISSARY_PREFIX = /^janissary\s+/i;

function replyLines(text: string): ReplyLine[] {
  const lines: ReplyLine[] = [];
  let start = 0;
  for (const line of text.split('\n')) {
    lines.push({ text: line, start, end: start + line.length });
    start += line.length + 1;
  }
  return lines;
}

function fenceInfo(line: string): string {
  return line.replace(/^ {0,3}(?:`{3,}|~{3,})/, '');
}

function isCommandStart(line: string, allowQuestion: boolean): boolean {
  const name = nativeCommandName(line.replace(/^\//, ''));
  if (name === undefined) return false;
  return allowQuestion || !name.startsWith('question ');
}

function commandFromBlock(
  lines: ReplyLine[], open: number, close: number, allowQuestion: boolean,
): BlockResult {
  const content = lines.slice(open + 1, close).map((line) => line.text);
  const starts: number[] = [];
  for (const [index, line] of content.entries()) {
    if (isCommandStart(line.trim().replace(JANISSARY_PREFIX, ''), allowQuestion)) starts.push(index);
  }
  if (starts.length !== 1) return { kind: 'mistake', commands: starts.length };

  const commandIndex = starts[0];
  const command = content
    .map((line, index) => (index === commandIndex ? line.trim().replace(JANISSARY_PREFIX, '') : line))
    .join('\n')
    .trim();
  return {
    kind: 'batch',
    commands: [{ command, span: { start: lines[open].start, end: lines[close].end } }],
  };
}

function findCandidate(lines: ReplyLine[]): Candidates {
  let fence: CodeFence | undefined;
  let open = 0;
  let labelled = false;
  const closed: Candidate[] = [];

  for (const [index, line] of lines.entries()) {
    const text = line.text;
    if (fence) {
      if (closesFence(text, fence)) {
        if (labelled) closed.push({ open, close: index });
        fence = undefined;
        labelled = false;
      }
      continue;
    }
    const opening = openingFence(text);
    if (!opening) continue;
    fence = opening;
    labelled = fenceInfo(text) === LABEL;
    open = index;
  }
  return { closed, unclosedLabelled: fence !== undefined && labelled };
}

export function extractCommandBlock(text: string, allowQuestion: boolean): CommandBlockResult {
  const lines = replyLines(text);
  const { closed, unclosedLabelled } = findCandidate(lines);
  if (unclosedLabelled) return { kind: 'mistake', commands: 0 };
  if (closed.length === 0) return { kind: 'absent' };
  const commands: { command: string; span: CommandBlockSpan }[] = [];
  for (const candidate of closed) {
    const block = commandFromBlock(lines, candidate.open, candidate.close, allowQuestion);
    if (block.kind === 'mistake') return block;
    commands.push(...block.commands);
  }
  return { kind: 'batch', commands };
}
