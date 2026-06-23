import { describe, it, expect, vi } from 'vitest';
import { runAcpToolLoop } from './acp-loop.js';
import type { AcpLoopSession, AcpLoopHandlers } from './types.js';
import { extractDbCommand } from './db.js';
import { extractBrowserCommand } from './browser-command.js';

// A fake ACP session that replies synchronously from a scripted list (the last
// reply repeats once exhausted) and records every prompt it was sent.
function makeSession(replies: string[]) {
  const sent: string[] = [];
  let i = 0;
  const session: AcpLoopSession = {
    prompt(text, h) {
      sent.push(text);
      const reply = replies[Math.min(i, replies.length - 1)] ?? '';
      i++;
      h.onChunk(reply);
      h.onEnd('end_turn');
    },
  };
  return { session, sent };
}

function makeHandlers() {
  const events: unknown[][] = [];
  const h: AcpLoopHandlers = {
    startTurn: (isFirst) => events.push(['startTurn', isFirst]),
    chunk: (c) => events.push(['chunk', c]),
    endTurn: (f) => events.push(['endTurn', f]),
    ranCommand: (cmd, result) => events.push(['ranCommand', cmd, result]),
    finished: (reason, max) => events.push(['finished', reason, max]),
    error: (m) => events.push(['error', m]),
  };
  return { h, events };
}

describe('runAcpToolLoop', () => {
  it('runs an extracted command, feeds the output back, and stops when the agent answers', () => {
    const { session, sent } = makeSession([
      'Looking it up.\ndb sqlite query movies SELECT name FROM actors',
      'The actors are Keanu and Carrie.',
    ]);
    const { h, events } = makeHandlers();
    const runCommand = vi.fn(() => 'name\n----\nKeanu\nCarrie\n\n(2 rows)');

    runAcpToolLoop(session, 'list actors', { runCommand, extractCommand: extractDbCommand }, h);

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
    expect(events.filter((e) => e[0] === 'startTurn')).toEqual([
      ['startTurn', true],
      ['startTurn', false],
    ]);
    expect(events.at(-1)).toEqual(['finished', 'answered', 8]);

    // The extracted command line is stripped from the agent reply shown to the user.
    // First endTurn: command removed, only prose remains.
    const firstEnd = events.find((e) => e[0] === 'endTurn');
    expect(firstEnd).toEqual(['endTurn', 'Looking it up.']);
    // ranCommand appears after the first endTurn.
    const firstEndIdx = events.indexOf(firstEnd!);
    expect(events[firstEndIdx + 1]).toEqual([
      'ranCommand',
      'db sqlite query movies SELECT name FROM actors',
      'name\n----\nKeanu\nCarrie\n\n(2 rows)',
    ]);
  });

  it('strips the extracted command line from the agent reply before endTurn', () => {
    const { session } = makeSession([
      'First line.\nSecond line.\ndb sqlite query movies SELECT 1',
      'Final answer.',
    ]);
    const { h, events } = makeHandlers();

    runAcpToolLoop(session, 'q', { runCommand: () => 'r', extractCommand: extractDbCommand }, h);

    // The command line is removed; trailing blank lines after removal are trimmed.
    const endTurns = events.filter((e) => e[0] === 'endTurn');
    expect(endTurns[0]).toEqual(['endTurn', 'First line.\nSecond line.']);
    // Second turn has no command, full text preserved.
    expect(endTurns[1]).toEqual(['endTurn', 'Final answer.']);
  });

  it('passes full text to endTurn when no command is found', () => {
    const { session } = makeSession(['Just prose here.']);
    const { h, events } = makeHandlers();

    runAcpToolLoop(session, 'q', { runCommand: () => 'r', extractCommand: extractDbCommand }, h);

    const endTurns = events.filter((e) => e[0] === 'endTurn');
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

    runAcpToolLoop(session, 'q', { runCommand: () => 'r', extractCommand: extractDbCommand }, h);

    const endTurns = events.filter((e) => e[0] === 'endTurn');
    // Only the command line exists, stripping leaves empty string.
    expect(endTurns[0]).toEqual(['endTurn', '']);
    expect(endTurns[1]).toEqual(['endTurn', 'Done.']);
  });

  it('prepends the primer only on the first turn', () => {
    const { session, sent } = makeSession(['db sqlite query x SELECT 1', 'done']);
    runAcpToolLoop(
      session,
      'hi',
      { primer: 'PRIMER', runCommand: () => 'r', extractCommand: extractDbCommand },
      makeHandlers().h,
    );
    expect(sent[0]).toBe('PRIMER\n\nhi');
    expect(sent[1]).not.toContain('PRIMER');
  });

  it('stops at the step cap when the agent keeps issuing commands', () => {
    const { session } = makeSession(['db sqlite query x SELECT 1']); // always a command
    const { h, events } = makeHandlers();
    const runCommand = vi.fn(() => 'r');

    runAcpToolLoop(session, 'go', { runCommand, extractCommand: extractDbCommand, maxSteps: 2 }, h);

    expect(runCommand).toHaveBeenCalledTimes(2);
    expect(events.at(-1)).toEqual(['finished', 'capped', 2]);
  });

  it('finishes immediately when the first reply has no command', () => {
    const { session } = makeSession(['Sorry, I cannot help with that.']);
    const { h, events } = makeHandlers();
    const runCommand = vi.fn();

    runAcpToolLoop(session, 'q', { runCommand, extractCommand: extractDbCommand }, h);

    expect(runCommand).not.toHaveBeenCalled();
    expect(events.some((e) => e[0] === 'ranCommand')).toBe(false);
    expect(events.at(-1)).toEqual(['finished', 'answered', 8]);
  });

  it('retries the first turn once when the agent returns an empty reply (cold start)', () => {
    // First reply is empty (cold start), second reply has the real answer.
    const { session, sent } = makeSession(['', 'The actors are Keanu and Carrie.']);
    const { h, events } = makeHandlers();

    runAcpToolLoop(session, 'list actors', { runCommand: () => 'r', extractCommand: extractDbCommand }, h);

    // The prompt was re-sent, but only one transcript entry was started.
    expect(sent).toHaveLength(2);
    expect(events.filter((e) => e[0] === 'startTurn')).toEqual([['startTurn', true]]);
    expect(events).toContainEqual(['endTurn', 'The actors are Keanu and Carrie.']);
    expect(events.at(-1)).toEqual(['finished', 'answered', 8]);
  });

  it('does not retry past the first turn or more than once', () => {
    // Always empty: one retry on the first turn, then it gives up.
    const { session, sent } = makeSession(['']);
    const { h, events } = makeHandlers();

    runAcpToolLoop(session, 'q', { runCommand: () => 'r', extractCommand: extractDbCommand }, h);

    expect(sent).toHaveLength(2); // initial + one retry
    expect(events.at(-1)).toEqual(['finished', 'answered', 8]);
  });

  it('strips code fences around the extracted command from endTurn', () => {
    const { session } = makeSession([
      'Looking up.\n```\ndb sqlite query movies SELECT 1\n```\nDone.',
      'Final answer.',
    ]);
    const { h, events } = makeHandlers();

    runAcpToolLoop(session, 'q', { runCommand: () => 'r', extractCommand: extractDbCommand }, h);

    const endTurns = events.filter((e) => e[0] === 'endTurn');
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

    runAcpToolLoop(session, 'summarize example.com', { runCommand, extractCommand: extractBrowserCommand }, h);

    // The loop suspends on the async command, so the follow-up has not been sent yet.
    expect(sent).toHaveLength(1);
    await vi.waitFor(() => expect(events.at(-1)).toEqual(['finished', 'answered', 8]));

    expect(runCommand).toHaveBeenCalledExactlyOnceWith('browser content');
    expect(sent[1]).toContain('Output of `browser content`');
    expect(sent[1]).toContain('Welcome to widgets.');
    expect(events).toContainEqual(['endTurn', 'The page is about widgets.']);
  });

  it('surfaces session errors without running a command', () => {
    const session: AcpLoopSession = { prompt: (_t, h) => h.onError('boom') };
    const { h, events } = makeHandlers();
    const runCommand = vi.fn();

    runAcpToolLoop(session, 'q', { runCommand, extractCommand: extractDbCommand }, h);

    expect(events).toContainEqual(['error', 'boom']);
    expect(runCommand).not.toHaveBeenCalled();
  });
});
