import { describe, expect, it, vi } from 'vitest';
import type { AcpLoopHandlers, AcpLoopSession, AcpRunSnapshot, AcpRunSnapshotRow } from './types.js';
import type { RemoteAcpSession } from '../remote/acp-session.js';
import { corePrimer, driveToolLoop, runToolLoop } from './drive-loop.js';
import { createAcpToolTable } from './tool-table.js';
import { NO_BUILTIN_TOOLS_LINE, NO_TOOLS_LINE } from './internal-tools.js';
import { MARKDOWN_INSTRUCTION } from './launch.js';
import { BROWSER_PRIMER } from '../browser/command.js';
import { DB_PRIMER } from '../database/primer.js';

const TELL_INSTRUCTION = 'The user is instructing you to carry out a task. Do it with the commands available to you, then briefly report what you did.';

type CoreSnapshot = Extract<AcpRunSnapshot, { kind: 'core' }>;

function coreSnapshot(
  role: 'ask' | 'tell', grants: string[], rows: AcpRunSnapshotRow[] = [], withoutTools = false,
): CoreSnapshot {
  return { kind: 'core', role, roleName: role, grants, rows, withoutTools };
}

function primerFor(snapshot: CoreSnapshot): string {
  return corePrimer(snapshot, createAcpToolTable(snapshot.grants));
}

describe('corePrimer', () => {
  it('orders tool text, the tools line, the tell instruction, and Markdown for tell', () => {
    expect(primerFor(coreSnapshot('tell', ['db sqlite query']))).toBe([
      DB_PRIMER,
      'Only these commands are allowed: db sqlite query.',
      NO_BUILTIN_TOOLS_LINE,
      TELL_INSTRUCTION,
      MARKDOWN_INSTRUCTION,
    ].join('\n\n'));
  });

  it('does not give the ask role the tell instruction', () => {
    const result = primerFor(coreSnapshot('ask', ['db sqlite query']));
    expect(result).not.toContain(TELL_INSTRUCTION);
    expect(result.startsWith(DB_PRIMER)).toBe(true);
    expect(result.endsWith(MARKDOWN_INSTRUCTION)).toBe(true);
  });

  it('excludes an agent-off command from the allow-list but keeps its owner primer', () => {
    const result = primerFor(coreSnapshot('ask', ['browser goto', 'db sqlite query'], [
      { name: 'browser goto', effectiveEnabled: true, effectiveAgentAccess: false },
    ]));
    expect(result).toContain(BROWSER_PRIMER);
    expect(result).toContain(DB_PRIMER);
    expect(result).toContain('Only these commands are allowed: db sqlite query.');
    expect(result).not.toContain('browser goto,');
    expect(result).toContain(NO_BUILTIN_TOOLS_LINE);
    expect(result).not.toContain(NO_TOOLS_LINE);
  });

  it('gives only the no-tools line and Markdown when the caller passes no tools', () => {
    const snapshot = coreSnapshot('ask', ['db sqlite query'], [], true);
    expect(corePrimer(snapshot, [])).toBe([NO_TOOLS_LINE, MARKDOWN_INSTRUCTION].join('\n\n'));
  });
});

const QUERY = 'db sqlite query movies SELECT 1';

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
    startCommand: (command, workspace) => { events.push(['startCommand', command, workspace]); },
    ranCommand: (command, result, workspace, refused) => {
      events.push(['ranCommand', command, result, workspace, refused]);
    },
    finished: (reason, max) => { events.push(['finished', reason, max]); },
    error: (m) => { events.push(['error', m]); },
  };
  return { h, events };
}

function drive(snapshot: AcpRunSnapshot, replies: string[]) {
  const { session, sent } = makeSession(replies);
  const { h, events } = makeHandlers();
  const host = { runCaller: vi.fn(() => 'caller output'), runWorkspace: vi.fn(() => 'workspace output') };
  driveToolLoop(session, 'do it', snapshot, host, h, new AbortController().signal);
  return { sent, events, host };
}

function drivePending() {
  const { session, sent } = makeSession([QUERY, 'Done.']);
  const { h, events } = makeHandlers();
  const controller = new AbortController();
  const { promise, resolve, reject } = Promise.withResolvers<string>();
  const host = { runCaller: vi.fn(() => promise), runWorkspace: vi.fn(() => 'workspace output') };
  driveToolLoop(session, 'do it', coreSnapshot('tell', ['db sqlite query']), host, h, controller.signal);
  return { sent, events, host, controller, resolve, reject };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

const PENDING_EVENTS = [
  ['startTurn', true],
  ['chunk', QUERY],
  ['endTurn', ''],
  ['startCommand', QUERY, false],
];

const ofKind = (events: unknown[][], kind: string) => events.filter((event) => event[0] === kind);

describe('driveToolLoop', () => {
  it('routes a caller command to runCaller and feeds its output back', () => {
    const { sent, host } = drive(coreSnapshot('tell', ['db sqlite query']), [QUERY, 'Done.']);
    expect(host.runCaller).toHaveBeenCalledExactlyOnceWith(QUERY);
    expect(host.runWorkspace).not.toHaveBeenCalled();
    expect(sent[1]).toContain(`Output of \`${QUERY}\`:`);
    expect(sent[1]).toContain('caller output');
  });

  it('routes a file read to runWorkspace and feeds its output back', () => {
    const { sent, host } = drive(coreSnapshot('tell', ['file read']), ['file read notes.md', 'Done.']);
    expect(host.runWorkspace).toHaveBeenCalledExactlyOnceWith('file read notes.md');
    expect(host.runCaller).not.toHaveBeenCalled();
    expect(sent[1]).toContain('workspace output');
  });

  it('fires events in order for one caller step and a plain answer', () => {
    const { events } = drive(coreSnapshot('tell', ['db sqlite query']), [QUERY, 'Done.']);
    expect(events).toEqual([
      ['startTurn', true],
      ['chunk', QUERY],
      ['endTurn', ''],
      ['startCommand', QUERY, false],
      ['ranCommand', QUERY, 'caller output', false, undefined],
      ['startTurn', false],
      ['chunk', 'Done.'],
      ['endTurn', 'Done.'],
      ['finished', 'answered', 8],
    ]);
  });

  it('reports a file read step as a workspace step', () => {
    const { events } = drive(coreSnapshot('tell', ['file read']), ['file read notes.md', 'Done.']);
    expect(ofKind(events, 'startCommand')).toEqual([['startCommand', 'file read notes.md', true]]);
    expect(ofKind(events, 'ranCommand')).toEqual([
      ['ranCommand', 'file read notes.md', 'workspace output', true, undefined],
    ]);
  });

  it('returns a disabled refusal as one step without calling the host', () => {
    const snapshot = coreSnapshot('tell', ['db sqlite query'], [
      { name: 'db sqlite query', effectiveEnabled: true, effectiveAgentAccess: false },
    ]);
    const { sent, events, host } = drive(snapshot, [QUERY, 'Done.']);
    const refusal = 'Command is disabled: db sqlite query.';
    expect(ofKind(events, 'startCommand')).toEqual([['startCommand', QUERY, false]]);
    expect(ofKind(events, 'ranCommand')).toEqual([['ranCommand', QUERY, refusal, false, 'disabled']]);
    expect(events.findIndex((e) => e[0] === 'startCommand')).toBeLessThan(events.findIndex((e) => e[0] === 'ranCommand'));
    expect(host.runCaller).not.toHaveBeenCalled();
    expect(host.runWorkspace).not.toHaveBeenCalled();
    expect(sent[1]).toContain(refusal);
  });

  it('returns a role refusal as one step without calling the host', () => {
    const { sent, events, host } = drive(coreSnapshot('ask', ['db sqlite list']), [QUERY, 'Done.']);
    const refusal = 'Command not allowed for role "ask": db sqlite query.';
    expect(ofKind(events, 'startCommand')).toEqual([['startCommand', QUERY, false]]);
    expect(ofKind(events, 'ranCommand')).toEqual([['ranCommand', QUERY, refusal, false, undefined]]);
    expect(host.runCaller).not.toHaveBeenCalled();
    expect(host.runWorkspace).not.toHaveBeenCalled();
    expect(sent[1]).toContain(refusal);
  });

  it('stops after eight steps with the capped reason', () => {
    const { events, host } = drive(coreSnapshot('tell', ['db sqlite query']), [QUERY]);
    expect(host.runCaller).toHaveBeenCalledTimes(8);
    expect(ofKind(events, 'ranCommand')).toHaveLength(8);
    expect(events.at(-1)).toEqual(['finished', 'capped', 8]);
  });

  it('drops a host result that arrives after the abort', async () => {
    const { sent, events, host, controller, resolve } = drivePending();
    expect(host.runCaller).toHaveBeenCalledExactlyOnceWith(QUERY);
    controller.abort();
    resolve('caller output');
    await flush();
    expect(events).toEqual(PENDING_EVENTS);
    expect(sent).toHaveLength(1);
  });

  it('drops a host rejection that arrives after the abort', async () => {
    const { sent, events, host, controller, reject } = drivePending();
    expect(host.runCaller).toHaveBeenCalledExactlyOnceWith(QUERY);
    controller.abort();
    reject(new Error('host failed'));
    await flush();
    expect(events).toEqual(PENDING_EVENTS);
    expect(sent).toHaveLength(1);
  });

  it('reports a host rejection before any abort as one error', async () => {
    const { sent, events, host, reject } = drivePending();
    expect(host.runCaller).toHaveBeenCalledExactlyOnceWith(QUERY);
    reject(new Error('host failed'));
    await vi.waitFor(() => { expect(ofKind(events, 'error')).toEqual([['error', 'host failed']]); });
    expect(ofKind(events, 'ranCommand')).toEqual([]);
    expect(sent).toHaveLength(1);
  });
});

describe('runToolLoop', () => {
  function makeRemoteSession() {
    const run = vi.fn();
    const session: RemoteAcpSession = {
      remote: true, run, ready: Promise.resolve(true), release: async () => true,
      cancel: async () => {}, kill: () => {}, shutdown: async () => {},
    };
    return { session, run };
  }

  it('hands a remote session its run instead of driving the local loop', () => {
    const { session, run } = makeRemoteSession();
    const { h, events } = makeHandlers();
    const host = { runCaller: vi.fn(() => 'caller output'), runWorkspace: vi.fn(() => 'workspace output') };
    const snapshot = coreSnapshot('tell', ['db sqlite query']);

    runToolLoop(session, 'do it', snapshot, host, h, new AbortController().signal);

    expect(run).toHaveBeenCalledExactlyOnceWith('do it', snapshot, host.runCaller, h);
    expect(host.runCaller).not.toHaveBeenCalled();
    expect(host.runWorkspace).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it('sends nothing to a remote session when the signal is already aborted', () => {
    const { session, run } = makeRemoteSession();
    const controller = new AbortController();
    controller.abort();

    runToolLoop(
      session, 'do it', coreSnapshot('tell', ['db sqlite query']),
      { runCaller: vi.fn(), runWorkspace: vi.fn() }, makeHandlers().h, controller.signal,
    );

    expect(run).not.toHaveBeenCalled();
  });

  it('drives a core run through the gate-and-route driver', () => {
    const { session, sent } = makeSession([QUERY, 'Done.']);
    const { h, events } = makeHandlers();
    const host = { runCaller: vi.fn(() => 'caller output'), runWorkspace: vi.fn(() => 'workspace output') };
    runToolLoop(session, 'do it', coreSnapshot('tell', ['db sqlite query']), host, h, new AbortController().signal);
    expect(host.runCaller).toHaveBeenCalledExactlyOnceWith(QUERY);
    expect(sent[1]).toContain('caller output');
    expect(events.at(-1)).toEqual(['finished', 'answered', 8]);
  });

  it('drives an agent run through the gate-and-route driver', () => {
    const { session, sent } = makeSession(['janissary db sqlite list', 'Done.']);
    const { h, events } = makeHandlers();
    const host = { runCaller: vi.fn(() => 'caller output'), runWorkspace: vi.fn(() => 'workspace output') };
    runToolLoop(session, 'do it', { kind: 'agent', grants: ['db'], askUser: false }, host, h, new AbortController().signal);
    expect(host.runCaller).toHaveBeenCalledExactlyOnceWith('db sqlite list');
    expect(sent[1]).toContain('caller output');
    expect(events.at(-1)).toEqual(['finished', 'answered', Infinity]);
  });
});

describe('driveToolLoop agent runs', () => {
  it('uses only the Markdown primer and routes an extracted caller command', () => {
    const { sent, events, host } = drive({ kind: 'agent', grants: ['db'], askUser: false }, ['janissary db sqlite list', 'Done.']);
    expect(sent[0]).toBe(`${MARKDOWN_INSTRUCTION}\n\ndo it`);
    expect(host.runCaller).toHaveBeenCalledExactlyOnceWith('db sqlite list');
    expect(host.runWorkspace).not.toHaveBeenCalled();
    expect(sent[1]).toContain('caller output');
    expect(ofKind(events, 'ranCommand')).toEqual([['ranCommand', 'db sqlite list', 'caller output', false, undefined]]);
  });

  it('routes granted file reads to the workspace', () => {
    const { sent, events, host } = drive({ kind: 'agent', grants: ['file'], askUser: false }, ['janissary file read a.md', 'Done.']);
    expect(host.runWorkspace).toHaveBeenCalledExactlyOnceWith('file read a.md');
    expect(host.runCaller).not.toHaveBeenCalled();
    expect(sent[1]).toContain('workspace output');
    expect(ofKind(events, 'startCommand')).toEqual([['startCommand', 'file read a.md', true]]);
    expect(ofKind(events, 'ranCommand')).toEqual([['ranCommand', 'file read a.md', 'workspace output', true, undefined]]);
  });

  it('feeds an ungranted file read refusal back as one step without invoking either host side', () => {
    const { sent, events, host } = drive({ kind: 'agent', grants: [], askUser: false }, ['janissary file read a.md', 'Done.']);
    const refusal = 'Agent: command not permitted: file read a.md.';
    expect(host.runWorkspace).not.toHaveBeenCalled();
    expect(host.runCaller).not.toHaveBeenCalled();
    expect(sent[1]).toContain(refusal);
    expect(ofKind(events, 'ranCommand')).toEqual([['ranCommand', 'file read a.md', refusal, false, undefined]]);
  });

  it.each([false, true])('extracts a bare question only with askUser enabled (%s)', (askUser) => {
    const command = 'question ask "x"';
    const { sent, host } = drive({ kind: 'agent', grants: ['question'], askUser }, [command, 'Done.']);
    if (askUser) {
      expect(host.runCaller).toHaveBeenCalledExactlyOnceWith(command);
      expect(sent).toHaveLength(2);
    } else {
      expect(host.runCaller).not.toHaveBeenCalled();
      expect(sent).toHaveLength(1);
    }
    expect(host.runWorkspace).not.toHaveBeenCalled();
  });

  it('runs twenty steps without a cap', () => {
    const replies = [...Array.from({ length: 20 }, () => 'janissary db sqlite list'), 'Done.'];
    const { sent, events, host } = drive({ kind: 'agent', grants: ['db'], askUser: false }, replies);
    expect(host.runCaller).toHaveBeenCalledTimes(20);
    expect(sent).toHaveLength(21);
    expect(ofKind(events, 'ranCommand')).toHaveLength(20);
    expect(events.at(-1)).toEqual(['finished', 'answered', Infinity]);
  });
});
