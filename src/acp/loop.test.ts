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
        return {
          kind: 'batch',
          commands: [{ command, span: { start: starts[index], end: starts[index] + lines[index].length } }],
        };
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

  it('delivers a throwing command as an ordinary result and keeps going', () => {
    const command = 'db sqlite query movies SELECT 1';
    const { session, sent } = makeSession([command, 'Done.']);
    const { h, events } = makeHandlers();
    const runCommand = vi.fn(() => { throw new Error('boom'); });

    runAcpToolLoop(session, 'list actors', { runCommand, extractCommand: database }, h);

    expect(runCommand).toHaveBeenCalledExactlyOnceWith(command);
    expect(sent[1]).toContain(`Output of \`${command}\`:\nACP error: boom`);
    expect(events).toContainEqual(['ranCommand', command, 'ACP error: boom']);
    expect(events.some((event) => event[0] === 'error')).toBe(false);
    expect(events.some((event) => event[0] === 'finished' && event[1] === 'failed')).toBe(false);
    expect(events.at(-1)).toEqual(['finished', 'answered', 8]);
  });

  it('delivers an async command rejection as an ordinary result and keeps going', async () => {
    const command = 'db sqlite query movies SELECT 1';
    const { session, sent } = makeSession([command, 'Done.']);
    const { h, events } = makeHandlers();
    const runCommand = vi.fn(() => Promise.reject(new Error('late boom')));

    runAcpToolLoop(session, 'list actors', { runCommand, extractCommand: database }, h);

    await vi.waitFor(() => { expect(events.at(-1)).toEqual(['finished', 'answered', 8]); });
    expect(sent[1]).toContain(`Output of \`${command}\`:\nACP error: late boom`);
    expect(events).toContainEqual(['ranCommand', command, 'ACP error: late boom']);
    expect(events.some((event) => event[0] === 'error')).toBe(false);
    expect(events.some((event) => event[0] === 'finished' && event[1] === 'failed')).toBe(false);
  });

  it('removes every matched block when a command is echoed twice', () => {
    const text = '```janissary\nnotify hello\n```\n\n```janissary\nnotify hello\n```';
    const { session } = makeSession([text, 'Final answer.']);
    const { h, events } = makeHandlers();

    runAcpToolLoop(session, 'q', { runCommand: () => 'r', extractCommand: block }, h);

    expect(events.find((event) => event[0] === 'endTurn')).toEqual(['endTurn', '']);
    expect(events.filter((event) => event[0] === 'ranCommand')).toHaveLength(2);
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

  function pendingCommands() {
    const resolvers: { command: string; resolve: (value: string) => void }[] = [];
    const runCommand = vi.fn((command: string) => {
      const pending = Promise.withResolvers<string>();
      resolvers.push({ command, resolve: pending.resolve });
      return pending.promise;
    });
    return { resolvers, runCommand };
  }

  it('launches every command in a batch in parallel before any result is fed back', async () => {
    const text = '```janissary\nnotify a\n```\n\n```janissary\nnotify b\n```';
    const { session, sent } = makeSession([text]);
    const { h, events } = makeHandlers();
    const { resolvers, runCommand } = pendingCommands();

    runAcpToolLoop(session, 'q', { runCommand, extractCommand: block }, h);

    expect(runCommand).toHaveBeenCalledTimes(2);
    expect(resolvers.map((entry) => entry.command)).toEqual(['notify a', 'notify b']);
    expect(sent).toHaveLength(1);
    resolvers[0].resolve('A');
    resolvers[1].resolve('B');
    await vi.waitFor(() => {
      expect(events.filter((event) => event[0] === 'ranCommand')).toHaveLength(2);
    });
    expect(events).toContainEqual(['ranCommand', 'notify a', 'A']);
    expect(events).toContainEqual(['ranCommand', 'notify b', 'B']);
  });

  it('sends one follow-up per finished command in completion order with the unchanged block', async () => {
    const text = '```janissary\nnotify a\n```\n\n```janissary\nnotify b\n```';
    const { session, sent } = makeSession([text]);
    const { h } = makeHandlers();
    const { resolvers, runCommand } = pendingCommands();

    runAcpToolLoop(session, 'q', { runCommand, extractCommand: block }, h);

    resolvers[1].resolve('B first');
    await vi.waitFor(() => { expect(sent).toHaveLength(2); });
    expect(sent[1]).toContain('Output of `notify b`:\nB first\n\n');
    resolvers[0].resolve('A second');
    await vi.waitFor(() => { expect(sent).toHaveLength(3); });
    expect(sent[2]).toContain('Output of `notify a`:\nA second\n\n');
    expect(sent[2]).toContain(
      'If the task is complete, reply with the final answer and no command. ' +
      'Otherwise issue the next command. ' +
      'Be concise: do not explain what you are doing. Only output commands and the final answer.',
    );
  });

  it('removes all matched blocks while keeping the prose between and after them', () => {
    const text = 'Intro.\n```janissary\nnotify a\n```\nBetween.\n```janissary\nnotify b\n```\nAfter.';
    const { session } = makeSession([text, 'Done.']);
    const { h, events } = makeHandlers();

    runAcpToolLoop(session, 'q', { runCommand: () => 'r', extractCommand: block }, h);

    expect(events.find((event) => event[0] === 'endTurn'))
      .toEqual(['endTurn', 'Intro.\nBetween.\nAfter.']);
  });

  it('finishes as answered when the agent replies with no command after a batch', () => {
    const { session } = makeSession(['```janissary\nnotify a\n```', 'All done.']);
    const { h, events } = makeHandlers();

    runAcpToolLoop(session, 'q', { runCommand: () => 'r', extractCommand: block }, h);

    expect(events).toContainEqual(['ranCommand', 'notify a', 'r']);
    expect(events.at(-1)).toEqual(['finished', 'answered', 8]);
  });

  it('queues a new batch behind results already waiting so follow-ups stay in completion order', () => {
    const batchA = '```janissary\nnotify a\n```\n\n```janissary\nnotify b\n```';
    const batchC = '```janissary\nnotify c\n```';
    const { session, sent } = makeSession([batchA, batchC]);
    const { h } = makeHandlers();

    runAcpToolLoop(session, 'q', { runCommand: (command) => `out:${command}`, extractCommand: block }, h);

    expect(sent[1]).toContain('Output of `notify a`:\nout:notify a');
    expect(sent[2]).toContain('Output of `notify b`:\nout:notify b');
    expect(sent[3]).toContain('Output of `notify c`:\nout:notify c');
  });

  it('delivers an executed result before the over-budget refusal when the command is async', async () => {
    const batch = '```janissary\nnotify one\n```\n\n```janissary\nnotify two\n```';
    const { session, sent } = makeSession([batch, 'All done.']);
    const { h, events } = makeHandlers();
    const { promise: output, resolve: resolveOutput } = Promise.withResolvers<string>();
    const runCommand = vi.fn(() => output);

    runAcpToolLoop(session, 'q', { runCommand, extractCommand: block, maxSteps: 1 }, h);

    expect(runCommand).toHaveBeenCalledExactlyOnceWith('notify one');
    expect(sent).toHaveLength(1);

    resolveOutput('A');
    await vi.waitFor(() => { expect(sent).toHaveLength(3); });
    expect(sent[1]).toContain('Output of `notify one`:\nA');
    expect(sent[1]).not.toContain('ACP: step limit reached; command not run.');
    expect(sent[2]).toContain('Output of `notify two`:\nACP: step limit reached; command not run.');
    expect(events.at(-1)).toEqual(['finished', 'capped', 1]);
  });

  it('runs only the commands that fit and refuses the rest of an over-budget batch', () => {
    const batch = '```janissary\nnotify one\n```\n\n```janissary\nnotify two\n```\n\n```janissary\nnotify three\n```';
    const { session, sent } = makeSession([batch]);
    const { h, events } = makeHandlers();
    const runCommand = vi.fn(() => 'r');

    runAcpToolLoop(session, 'q', { runCommand, extractCommand: block, maxSteps: 1 }, h);

    expect(runCommand).toHaveBeenCalledExactlyOnceWith('notify one');
    const refusals = sent.filter((prompt) => prompt.includes('ACP: step limit reached; command not run.'));
    expect(refusals).toHaveLength(2);
    expect(refusals[0]).toContain('Output of `notify two`:\nACP: step limit reached; command not run.');
    expect(refusals[1]).toContain('Output of `notify three`:\nACP: step limit reached; command not run.');
    expect(events.at(-1)).toEqual(['finished', 'capped', 1]);
  });

  it('delivers every over-budget refusal before finishing capped when the agent answers early', () => {
    const batch = '```janissary\nnotify one\n```\n\n```janissary\nnotify two\n```\n\n```janissary\nnotify three\n```';
    const { session, sent } = makeSession([batch, 'All done.']);
    const { h, events } = makeHandlers();
    const runCommand = vi.fn(() => 'r');

    runAcpToolLoop(session, 'q', { runCommand, extractCommand: block, maxSteps: 1 }, h);

    expect(runCommand).toHaveBeenCalledExactlyOnceWith('notify one');
    const refusals = sent.filter((prompt) => prompt.includes('ACP: step limit reached; command not run.'));
    expect(refusals).toHaveLength(2);
    expect(refusals[0]).toContain('Output of `notify two`:\nACP: step limit reached; command not run.');
    expect(refusals[1]).toContain('Output of `notify three`:\nACP: step limit reached; command not run.');
    expect(events.at(-1)).toEqual(['finished', 'capped', 1]);
  });

  it('sends the correction and runs nothing for a malformed reply without spending a step', () => {
    const { session, sent } = makeSession([
      '```janissary\njust prose\n```',
      '```janissary\nnotify hello\n```',
      'Final answer.',
    ]);
    const { h, events } = makeHandlers();
    const runCommand = vi.fn(() => 'r');

    runAcpToolLoop(session, 'q', { runCommand, extractCommand: block, maxSteps: 1 }, h);

    expect(sent[1]).toBe(CORRECTION_PROMPT);
    expect(runCommand).toHaveBeenCalledExactlyOnceWith('notify hello');
    expect(events.at(-1)).toEqual(['finished', 'answered', 1]);
  });

  it('sends no further prompt when the signal aborts while a batch is in flight', async () => {
    const text = '```janissary\nnotify a\n```\n\n```janissary\nnotify b\n```';
    const controller = new AbortController();
    const { session, sent } = makeSession([text]);
    const { h, events } = makeHandlers();
    const { resolvers, runCommand } = pendingCommands();

    runAcpToolLoop(session, 'q', { signal: controller.signal, runCommand, extractCommand: block }, h);

    expect(sent).toHaveLength(1);
    controller.abort();
    resolvers[0].resolve('A');
    resolvers[1].resolve('B');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sent).toHaveLength(1);
    expect(events.filter((event) => event[0] === 'ranCommand')).toHaveLength(0);
    expect(events.some((event) => event[0] === 'finished')).toBe(false);
  });

  it('uses the new sentence for a zero-command correction', () => {
    expect(CORRECTION_PROMPT)
      .toBe('Your reply must contain one or more commands, each inside its own ```janissary fenced block. Try again.');
    const { session, sent } = makeSession(['```janissary\njust prose\n```', 'Done.']);

    runAcpToolLoop(session, 'q', { runCommand: vi.fn(), extractCommand: block }, makeHandlers().h);

    expect(sent[1]).toBe(CORRECTION_PROMPT);
  });
});
