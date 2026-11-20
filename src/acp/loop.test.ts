import { describe, it, expect, vi } from 'vitest';
import { CORRECTION_PROMPT, runAcpToolLoop } from './loop.js';
import { extractCommandBlock, type CommandBlockResult } from './command-block.js';
import { cleanCommandLine } from './command-line.js';
import type { AcpLoopSession, AcpLoopHandlers } from './types.js';
import { extractDatabaseCommand } from '../database/primer.js';
import { extractBrowserCommand } from '../browser/command.js';
import { extractQuestionCommand } from '../question-command.js';

// The legacy extractors still find the command in this subplan; this adapter reports what they find
// in the new three-variant shape with the span of the matched reply line.
function lineSpan(extract: (text: string) => string | null): (text: string) => CommandBlockResult {
  return (text) => {
    const command = extract(text);
    if (command === null) return { kind: 'absent' };
    const lines = text.split('\n');
    const starts: number[] = [];
    let offset = 0;
    for (const line of lines) {
      starts.push(offset);
      offset += line.length + 1;
    }
    for (let index = lines.length - 1; index >= 0; index--) {
      if (cleanCommandLine(lines[index]) === command) {
        return { kind: 'one', command, span: { start: starts[index], end: starts[index] + lines[index].length } };
      }
    }
    return { kind: 'absent' };
  };
}

const database = lineSpan(extractDatabaseCommand);
const browser = lineSpan(extractBrowserCommand);
const question = lineSpan(extractQuestionCommand);
const block = (text: string): CommandBlockResult => extractCommandBlock(text, true);

// A fake ACP session that replies synchronously from a scripted list (the last
// reply repeats once exhausted) and records every prompt it was sent.
function makeSession(replies: string[]) {
  const sent: string[] = [];
  let index = 0;
  const session: AcpLoopSession = {
    prompt(text, h) {
      sent.push(text);
      const reply = replies[Math.min(index, replies.length - 1)] ?? '';
      index++;
      h.onChunk(reply);
      h.onEnd('end_turn');
    },
  };
  return { session, sent };
}

function makeHandlers() {
  const events: unknown[][] = [];
  const h: AcpLoopHandlers = {
    startTurn: (isFirst) => { events.push(['startTurn', isFirst]); },
    chunk: (c) => { events.push(['chunk', c]); },
    endTurn: (f) => { events.push(['endTurn', f]); },
    ranCommand: (command, result) => { events.push(['ranCommand', command, result]); },
    finished: (reason, max) => { events.push(['finished', reason, max]); },
    error: (m) => { events.push(['error', m]); },
  };
  return { h, events };
}

describe('runAcpToolLoop', () => {
  it('labels the follow-up with describeCommand while ranCommand keeps the full command', () => {
    const command = 'db sqlite query movies SELECT name FROM actors';
    const { session, sent } = makeSession([command, 'Done.']);
    const { h, events } = makeHandlers();
    runAcpToolLoop(session, 'list actors', {
      runCommand: () => 'ok', extractCommand: database, describeCommand: () => 'short label',
    }, h);
    expect(sent[1]).toContain('Output of `short label`:\nok');
    expect(sent[1]).not.toContain(command);
    expect(events).toContainEqual(['ranCommand', command, 'ok']);
  });

  it('runs an extracted command, feeds the output back, and stops when the agent answers', () => {
    const { session, sent } = makeSession([
      'Looking it up.\ndb sqlite query movies SELECT name FROM actors',
      'The actors are Keanu and Carrie.',
    ]);
    const { h, events } = makeHandlers();
    const runCommand = vi.fn(() => 'name\n----\nKeanu\nCarrie\n\n(2 rows)');

    runAcpToolLoop(session, 'list actors', { runCommand, extractCommand: database }, h);

    // The command was executed and surfaced with its result.
    expect(runCommand).toHaveBeenCalledExactlyOnceWith('db sqlite query movies SELECT name FROM actors');
    expect(events).toContainEqual([
      'ranCommand',
      'db sqlite query movies SELECT name FROM actors',
      'name\n----\nKeanu\nCarrie\n\n(2 rows)',
    ]);
    // The result was fed back to the agent on the follow-up prompt.
    expect(sent[1]).toContain('Output of `db sqlite query movies SELECT name FROM actors`');
    expect(sent[1]).toContain('(2 rows)');
    // Two turns ran, then the loop finished because the second reply had no command.
    expect(events.filter((event) => event[0] === 'startTurn')).toEqual([
      ['startTurn', true],
      ['startTurn', false],
    ]);
    expect(events.at(-1)).toEqual(['finished', 'answered', 8]);

    // The extracted command line is stripped from the agent reply shown to the user.
    // First endTurn: command removed, only prose remains.
    const firstEnd = events.find((event) => event[0] === 'endTurn');
    expect(firstEnd).toEqual(['endTurn', 'Looking it up.']);
    // ranCommand appears after the first endTurn.
    const firstEndIndex = events.indexOf(firstEnd!);
    expect(events[firstEndIndex + 1]).toEqual([
      'ranCommand',
      'db sqlite query movies SELECT name FROM actors',
      'name\n----\nKeanu\nCarrie\n\n(2 rows)',
    ]);
  });

  it('waits for a human answer before continuing an agent question command', async () => {
    const { session, sent } = makeSession([
      'question ask "What port should I use?"',
      'Use port 4321.',
    ]);
    const { h, events } = makeHandlers();
    const { promise: answer, resolve: answerQuestion } = Promise.withResolvers<string>();

    runAcpToolLoop(session, 'configure the service', {
      runCommand: () => answer,
      extractCommand: question,
    }, h);

    expect(sent).toHaveLength(1);
    answerQuestion('4321');
    await vi.waitFor(() => { expect(sent).toHaveLength(2); });
    expect(sent[1]).toContain('Output of `question ask "What port should I use?"`:\n4321');
    expect(events).toContainEqual(['ranCommand', 'question ask "What port should I use?"', '4321']);
    expect(events.at(-1)).toEqual(['finished', 'answered', 8]);
  });

  it('strips the extracted command line from the agent reply before endTurn', () => {
    const { session } = makeSession([
      'First line.\nSecond line.\ndb sqlite query movies SELECT 1',
      'Final answer.',
    ]);
    const { h, events } = makeHandlers();

    runAcpToolLoop(session, 'q', { runCommand: () => 'r', extractCommand: database }, h);

    // The command line is removed; trailing blank lines after removal are trimmed.
    const endTurns = events.filter((event) => event[0] === 'endTurn');
    expect(endTurns[0]).toEqual(['endTurn', 'First line.\nSecond line.']);
    // Second turn has no command, full text preserved.
    expect(endTurns[1]).toEqual(['endTurn', 'Final answer.']);
  });

  it('passes full text to endTurn when no command is found', () => {
    const { session } = makeSession(['Just prose here.']);
    const { h, events } = makeHandlers();

    runAcpToolLoop(session, 'q', { runCommand: () => 'r', extractCommand: database }, h);

    const endTurns = events.filter((event) => event[0] === 'endTurn');
    expect(endTurns[0]).toEqual(['endTurn', 'Just prose here.']);
    // Only one turn: loop finishes when no command is found.
    expect(endTurns).toHaveLength(1);
    expect(events.at(-1)).toEqual(['finished', 'answered', 8]);
  });

  it('strips command-only replies to empty endTurn', () => {
    const { session } = makeSession([
      'db sqlite query movies SELECT 1',
      'Done.',
    ]);
    const { h, events } = makeHandlers();

    runAcpToolLoop(session, 'q', { runCommand: () => 'r', extractCommand: database }, h);

    const endTurns = events.filter((event) => event[0] === 'endTurn');
    // Only the command line exists, stripping leaves empty string.
    expect(endTurns[0]).toEqual(['endTurn', '']);
    expect(endTurns[1]).toEqual(['endTurn', 'Done.']);
  });

  it('prepends the primer only on the first turn', () => {
    const { session, sent } = makeSession(['db sqlite query x SELECT 1', 'done']);
    runAcpToolLoop(
      session,
      'hi',
      { primer: 'PRIMER', runCommand: () => 'r', extractCommand: database },
      makeHandlers().h,
    );
    expect(sent[0]).toBe('PRIMER\n\nhi');
    expect(sent[1]).not.toContain('PRIMER');
  });

  it('stops at the step cap when the agent keeps issuing commands', () => {
    const { session } = makeSession(['db sqlite query x SELECT 1']); // always a command
    const { h, events } = makeHandlers();
    const runCommand = vi.fn(() => 'r');

    runAcpToolLoop(session, 'go', { runCommand, extractCommand: database, maxSteps: 2 }, h);

    expect(runCommand).toHaveBeenCalledTimes(2);
    expect(events.at(-1)).toEqual(['finished', 'capped', 2]);
  });

  it('finishes immediately when the first reply has no command', () => {
    const { session } = makeSession(['Sorry, I cannot help with that.']);
    const { h, events } = makeHandlers();
    const runCommand = vi.fn();

    runAcpToolLoop(session, 'q', { runCommand, extractCommand: database }, h);

    expect(runCommand).not.toHaveBeenCalled();
    expect(events.some((event) => event[0] === 'ranCommand')).toBe(false);
    expect(events.at(-1)).toEqual(['finished', 'answered', 8]);
  });

  it('retries the first turn once when the agent returns an empty reply (cold start)', () => {
    // First reply is empty (cold start), second reply has the real answer.
    const { session, sent } = makeSession(['', 'The actors are Keanu and Carrie.']);
    const { h, events } = makeHandlers();

    runAcpToolLoop(session, 'list actors', { runCommand: () => 'r', extractCommand: database }, h);

    // The prompt was re-sent, but only one transcript entry was started.
    expect(sent).toHaveLength(2);
    expect(events.filter((event) => event[0] === 'startTurn')).toEqual([['startTurn', true]]);
    expect(events).toContainEqual(['endTurn', 'The actors are Keanu and Carrie.']);
    expect(events.at(-1)).toEqual(['finished', 'answered', 8]);
  });

  it('does not retry past the first turn or more than once', () => {
    // Always empty: one retry on the first turn, then it gives up.
    const { session, sent } = makeSession(['']);
    const { h, events } = makeHandlers();

    runAcpToolLoop(session, 'q', { runCommand: () => 'r', extractCommand: database }, h);

    expect(sent).toHaveLength(2); // initial + one retry
    expect(events.at(-1)).toEqual(['finished', 'answered', 8]);
  });

  it('strips code fences around the extracted command from endTurn', () => {
    const { session } = makeSession([
      'Looking up.\n```\ndb sqlite query movies SELECT 1\n```\nDone.',
      'Final answer.',
    ]);
    const { h, events } = makeHandlers();

    runAcpToolLoop(session, 'q', { runCommand: () => 'r', extractCommand: database }, h);

    const endTurns = events.filter((event) => event[0] === 'endTurn');
    // Fence lines removed along with the command.
    expect(endTurns[0]).toEqual(['endTurn', 'Looking up.\nDone.']);
    expect(endTurns[1]).toEqual(['endTurn', 'Final answer.']);
  });

  it('awaits an async runCommand and feeds its output into the follow-up prompt', async () => {
    const { session, sent } = makeSession([
      'Fetching.\nbrowser content',
      'The page is about widgets.',
    ]);
    const { h, events } = makeHandlers();
    // An async command (e.g. a browser action) resolves on a later tick.
    const runCommand = vi.fn(() => Promise.resolve('Widgets — https://example.com\n\nWelcome to widgets.'));

    runAcpToolLoop(session, 'summarize example.com', { runCommand, extractCommand: browser }, h);

    // The loop suspends on the async command, so the follow-up has not been sent yet.
    expect(sent).toHaveLength(1);
    await vi.waitFor(() => expect(events.at(-1)).toEqual(['finished', 'answered', 8]));

    expect(runCommand).toHaveBeenCalledExactlyOnceWith('browser content');
    expect(sent[1]).toContain('Output of `browser content`');
    expect(sent[1]).toContain('Welcome to widgets.');
    expect(events).toContainEqual(['endTurn', 'The page is about widgets.']);
  });

  it('removes the command line that ran, not an earlier copy of it, from endTurn', () => {
    const { session } = makeSession([
      'db sqlite list\nThat was the old list; refreshing.\ndb sqlite list',
      'Final answer.',
    ]);
    const { h, events } = makeHandlers();

    runAcpToolLoop(session, 'q', { runCommand: () => 'r', extractCommand: database }, h);

    const firstEndTurn = events.find((event) => event[0] === 'endTurn');
    expect(firstEndTurn).toEqual(['endTurn', 'db sqlite list\nThat was the old list; refreshing.']);
  });

  it('surfaces session errors without running a command', () => {
    const session: AcpLoopSession = { prompt: (_t, h) => h.onError('boom') };
    const { h, events } = makeHandlers();
    const runCommand = vi.fn();

    runAcpToolLoop(session, 'q', { runCommand, extractCommand: database }, h);

    expect(events).toContainEqual(['error', 'boom']);
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('emits a terminal event after a throwing command and starts no further turn', () => {
    const { session, sent } = makeSession(['db sqlite query movies SELECT 1', 'Done.']);
    const { h, events } = makeHandlers();
    const runCommand = vi.fn(() => { throw new Error('boom'); });

    runAcpToolLoop(session, 'list actors', { runCommand, extractCommand: database }, h);

    expect(events).toContainEqual(['error', 'boom']);
    expect(events.at(-1)).toEqual(['finished', 'failed', 8]);
    expect(events.findIndex((event) => event[0] === 'error'))
      .toBeLessThan(events.findIndex((event) => event[0] === 'finished'));
    expect(events.filter((event) => event[0] === 'startTurn')).toEqual([['startTurn', true]]);
    expect(sent).toHaveLength(1);
  });

  it('emits a terminal event after an async command rejection', async () => {
    const { session, sent } = makeSession(['db sqlite query movies SELECT 1', 'Done.']);
    const { h, events } = makeHandlers();
    const runCommand = vi.fn(() => Promise.reject(new Error('late boom')));

    runAcpToolLoop(session, 'list actors', { runCommand, extractCommand: database }, h);

    await vi.waitFor(() => { expect(events.at(-1)).toEqual(['finished', 'failed', 8]); });
    expect(events).toContainEqual(['error', 'late boom']);
    expect(sent).toHaveLength(1);
  });

  it('removes only the final block when a command is echoed twice, leaving one copy displayed', () => {
    const text = '```janissary\nnotify hello\n```\n\n```janissary\nnotify hello\n```';
    const { session } = makeSession([text, 'Final answer.']);
    const { h, events } = makeHandlers();

    runAcpToolLoop(session, 'q', { runCommand: () => 'r', extractCommand: block }, h);

    expect(events.find((event) => event[0] === 'endTurn'))
      .toEqual(['endTurn', '```janissary\nnotify hello\n```']);
    expect(events.filter((event) => event[0] === 'ranCommand')).toHaveLength(1);
  });

  it('keeps prose after the block in the displayed reply', () => {
    const { session } = makeSession([
      'Looking up.\n```janissary\nnotify hello\n```\nDone.',
      'Final answer.',
    ]);
    const { h, events } = makeHandlers();

    runAcpToolLoop(session, 'q', { runCommand: () => 'r', extractCommand: block }, h);

    expect(events.find((event) => event[0] === 'endTurn')).toEqual(['endTurn', 'Looking up.\nDone.']);
  });

  it('feeds back the shared correction sentence for a block with zero commands', () => {
    const { session, sent } = makeSession(['```janissary\njust prose\n```', 'All done.']);
    const { h, events } = makeHandlers();
    const runCommand = vi.fn(() => 'r');

    runAcpToolLoop(session, 'q', { runCommand, extractCommand: block }, h);

    expect(runCommand).not.toHaveBeenCalled();
    expect(sent[1]).toBe(CORRECTION_PROMPT);
    expect(sent[1]).not.toContain('Output of');
    expect(events.filter((event) => event[0] === 'startTurn')).toEqual([
      ['startTurn', true],
      ['startTurn', false],
    ]);
    expect(events.at(-1)).toEqual(['finished', 'answered', 8]);
  });

  it('feeds back the same correction sentence for a block with more than one command', () => {
    const { session, sent } = makeSession([
      '```janissary\nnotify one\ntab two\n```',
      'All done.',
    ]);
    const { h } = makeHandlers();

    runAcpToolLoop(session, 'q', { runCommand: () => 'r', extractCommand: block }, h);

    expect(sent[1]).toBe(CORRECTION_PROMPT);
  });

  it('does not spend a step on a correction before the first command', () => {
    const { session } = makeSession([
      '```janissary\njust prose\n```',
      '```janissary\nnotify hello\n```',
      'Final answer.',
    ]);
    const { h, events } = makeHandlers();
    const runCommand = vi.fn(() => 'r');

    runAcpToolLoop(session, 'q', { runCommand, extractCommand: block, maxSteps: 1 }, h);

    expect(runCommand).toHaveBeenCalledExactlyOnceWith('notify hello');
    expect(events.at(-1)).toEqual(['finished', 'answered', 1]);
  });

  it('counts only commands run toward the step cap, not corrections', () => {
    const { session, sent } = makeSession([
      '```janissary\njust prose\n```',
      '```janissary\nnotify hello\n```',
      '```janissary\njust prose\n```',
      '```janissary\nnotify hello\n```',
      '```janissary\nnotify hello\n```',
    ]);
    const { h, events } = makeHandlers();
    const runCommand = vi.fn(() => 'r');

    runAcpToolLoop(session, 'q', { runCommand, extractCommand: block, maxSteps: 2 }, h);

    expect(runCommand).toHaveBeenCalledTimes(2);
    expect(sent.filter((prompt) => prompt === CORRECTION_PROMPT)).toHaveLength(2);
    expect(events.at(-1)).toEqual(['finished', 'capped', 2]);
  });

  it('ends the turn as the final answer with the full reply when no labelled block is present', () => {
    const { session } = makeSession(['Just a final answer.']);
    const { h, events } = makeHandlers();
    const runCommand = vi.fn(() => 'r');

    runAcpToolLoop(session, 'q', { runCommand, extractCommand: block }, h);

    expect(runCommand).not.toHaveBeenCalled();
    expect(events.filter((event) => event[0] === 'endTurn')).toEqual([['endTurn', 'Just a final answer.']]);
    expect(events.at(-1)).toEqual(['finished', 'answered', 8]);
  });
});
