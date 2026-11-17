import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type * as nodeOs from 'node:os';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_TOOLS_LINE } from '../acp/internal-tools.js';
import { MARKDOWN_INSTRUCTION } from '../acp/launch.js';
import type { AcpRunSnapshot, AcpRunSnapshotRow, AcpSession, AcpToolHost, PromptHandlers } from '../acp/types.js';
import type * as DriveLoop from '../acp/drive-loop.js';
import { parseWebSearch, WEB_SEARCH_USAGE } from '../web-search/command.js';
import type { WebSearchCommand } from '../web-search/command.js';
import type { WebSearchDeps } from '../web-search/search.js';
import type { ProjectTokens } from '../project/tokens.js';
import { deferred } from '../deferred.js';
import type * as Glob from '../file-glob/glob.js';
import type * as Grep from '../file-grep/grep.js';
import { FILE_GREP_USAGE } from '../file-grep/command.js';
import * as fileGrepCandidates from '../file-grep/candidates.js';
import * as fileGrepScan from '../file-grep/scan.js';
import * as fileRead from '../file-read/read.js';
import type { ServerFrame } from './protocol-frames.js';

const mocks = vi.hoisted(() => ({
  globWorkspaceCommand: vi.fn(), grepWorkspaceCommand: vi.fn(), webSearch: vi.fn(), driveToolLoop: vi.fn(),
}));
const home = vi.hoisted(() => ({ dir: '' }));

vi.mock('node:os', async (importOriginal) => ({
  ...await importOriginal<typeof nodeOs>(),
  homedir: vi.fn(() => home.dir),
}));

vi.mock('../file-glob/glob.js', async (importOriginal) => {
  const actual = await importOriginal<typeof Glob>();
  mocks.globWorkspaceCommand.mockImplementation(actual.globWorkspaceCommand);
  return { ...actual, globWorkspaceCommand: mocks.globWorkspaceCommand };
});
vi.mock('../web-search/search.js', () => ({ webSearch: mocks.webSearch }));
vi.mock('../acp/drive-loop.js', async (importOriginal) => {
  const actual = await importOriginal<typeof DriveLoop>();
  mocks.driveToolLoop.mockImplementation(actual.driveToolLoop);
  return { ...actual, driveToolLoop: mocks.driveToolLoop };
});

vi.mock('../file-grep/grep.js', async (importOriginal) => {
  const actual = await importOriginal<typeof Grep>();
  mocks.grepWorkspaceCommand.mockImplementation(actual.grepWorkspaceCommand);
  return { ...actual, grepWorkspaceCommand: mocks.grepWorkspaceCommand };
});

import { startRemoteLoop } from './serve-acp-loop.js';

const RUN_ID = 'run-1';
const QUERY = 'db sqlite query movies SELECT 1';

type CoreSnapshot = Extract<AcpRunSnapshot, { kind: 'core' }>;

function coreSnapshot(
  role: 'ask' | 'tell', grants: string[], rows: AcpRunSnapshotRow[] = [], withoutTools = false,
): CoreSnapshot {
  return { kind: 'core', role, roleName: role, grants, rows, withoutTools };
}

function agentSnapshot(grants: string[], askUser = false): AcpRunSnapshot {
  return { kind: 'agent', grants, askUser };
}

function makeSession(turns: string[][]) {
  const sent: string[] = [];
  let index = 0;
  const session: AcpSession = {
    prompt(text, handlers) {
      sent.push(text);
      const deltas = turns[Math.min(index, turns.length - 1)] ?? [];
      index += 1;
      for (const delta of deltas) handlers.onChunk(delta);
      handlers.onEnd('end_turn');
    },
    cancel: async () => {},
    kill: () => {},
    shutdown: async () => {},
  };
  return { session, sent };
}

let workspace: string;
let homeDir: string;

beforeEach(() => {
  workspace = mkdtempSync(path.join(tmpdir(), 'janus-serve-acp-loop-'));
  homeDir = mkdtempSync(path.join(tmpdir(), 'janus-serve-acp-loop-home-'));
  home.dir = homeDir;
  mocks.grepWorkspaceCommand.mockClear();
  mocks.driveToolLoop.mockClear();
  mocks.webSearch.mockReset();
  mocks.webSearch.mockResolvedValue('search results');
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
  rmSync(homeDir, { recursive: true, force: true });
});

function start(turns: string[][], snapshot: AcpRunSnapshot, tokens: ProjectTokens = {}) {
  const { session, sent } = makeSession(turns);
  const frames: ServerFrame[] = [];
  const handle = startRemoteLoop(
    session,
    { type: 'acp-run', id: RUN_ID, text: 'do it', snapshot },
    workspace,
    tokens,
    (frame) => { frames.push(frame); },
  );
  return { frames, sent, handle };
}

function heldSession() {
  const sent: string[] = [];
  const handlers: PromptHandlers[] = [];
  const cancellation = deferred<void>();
  let cancels = 0;
  const session: AcpSession = {
    prompt(text, promptHandlers) {
      sent.push(text);
      handlers.push(promptHandlers);
    },
    cancel() {
      cancels += 1;
      return cancellation.promise;
    },
    kill: () => {},
    shutdown: async () => {},
  };
  return { session, sent, handlers, cancellation, cancels: () => cancels };
}

function startHeld(snapshot: AcpRunSnapshot, tokens: ProjectTokens = {}) {
  const held = heldSession();
  const frames: ServerFrame[] = [];
  const handle = startRemoteLoop(
    held.session,
    { type: 'acp-run', id: RUN_ID, text: 'do it', snapshot },
    workspace,
    tokens,
    (frame) => { frames.push(frame); },
  );
  return { ...held, frames, handle, last: () => held.handlers.at(-1)! };
}

function lastHost(): AcpToolHost {
  return mocks.driveToolLoop.mock.calls.at(-1)?.[3] as AcpToolHost;
}

function framesOf<T extends ServerFrame['type']>(frames: ServerFrame[], type: T) {
  return frames.filter((frame): frame is Extract<ServerFrame, { type: T }> => frame.type === type);
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('startRemoteLoop workspace steps', () => {
  it('runs a granted file read against the workspace and reports the numbered result', () => {
    writeFileSync(path.join(workspace, 'a.md'), 'one\ntwo\n');

    const { frames, sent } = start([['file read a.md'], ['Done.']], coreSnapshot('tell', ['file read']));

    expect(frames).toEqual([
      { type: 'acp-turn', id: RUN_ID, phase: 'start', first: true },
      { type: 'acp-chunk', id: RUN_ID, text: 'file read a.md' },
      { type: 'acp-turn', id: RUN_ID, phase: 'end', display: '' },
      { type: 'acp-tool-step', id: RUN_ID, command: 'file read a.md', result: '1\tone\n2\ttwo', workspace: true },
      { type: 'acp-turn', id: RUN_ID, phase: 'start', first: false },
      { type: 'acp-chunk', id: RUN_ID, text: 'Done.' },
      { type: 'acp-turn', id: RUN_ID, phase: 'end', display: 'Done.' },
      { type: 'acp-run-end', id: RUN_ID, reason: 'answered' },
    ]);
    expect(sent[1]).toContain('1\tone\n2\ttwo');
  });

  it('runs a granted web search against the workspace and reports the result as a workspace step', async () => {
    const tokens = { tavily: 'tvly-far' };
    const { frames } = start([['web search x'], ['Done.']], coreSnapshot('tell', ['web search']), tokens);

    await vi.waitFor(() => expect(framesOf(frames, 'acp-tool-step')).toHaveLength(1));
    expect(mocks.webSearch).toHaveBeenCalledOnce();
    const [request, deps] = mocks.webSearch.mock.calls[0] as [WebSearchCommand, WebSearchDeps];
    expect(request).toEqual(parseWebSearch('web search x'));
    expect(deps.tokens).toBe(tokens);
    expect(framesOf(frames, 'acp-tool-step')).toEqual([{
      type: 'acp-tool-step', id: RUN_ID, command: 'web search x', result: 'search results', workspace: true,
    }]);
  });

  it('caps a core run at eight workspace steps without sending a step count', () => {
    writeFileSync(path.join(workspace, 'a.md'), 'one\n');

    const { frames, sent } = start([['file read a.md']], coreSnapshot('tell', ['file read']));

    expect(framesOf(frames, 'acp-tool-step')).toHaveLength(8);
    expect(framesOf(frames, 'acp-run-end')).toEqual([{ type: 'acp-run-end', id: RUN_ID, reason: 'capped' }]);
    expect(sent).toHaveLength(9);
  });
});

describe('startRemoteLoop snapshot gate', () => {
  it('refuses a disabled agent-off row with workspace false and refused disabled', () => {
    const snapshot = coreSnapshot('tell', ['db sqlite query'], [
      { name: 'db sqlite query', effectiveEnabled: true, effectiveAgentAccess: false },
    ]);

    const { frames } = start([[QUERY], ['Done.']], snapshot);

    expect(framesOf(frames, 'acp-tool-step')).toEqual([{
      type: 'acp-tool-step', id: RUN_ID, command: QUERY,
      result: 'Command is disabled: db sqlite query.', workspace: false, refused: 'disabled',
    }]);
  });

  it('refuses a core command the role has not granted without a refused flag', () => {
    const { frames } = start([[QUERY], ['Done.']], coreSnapshot('ask', ['db sqlite list']));

    expect(framesOf(frames, 'acp-tool-step')).toEqual([{
      type: 'acp-tool-step', id: RUN_ID, command: QUERY,
      result: 'Command not allowed for role "ask": db sqlite query.', workspace: false,
    }]);
  });

  it('refuses an agent file read without the file grant', () => {
    const { frames } = start([['janissary file read a.md'], ['Done.']], agentSnapshot([]));

    expect(framesOf(frames, 'acp-tool-step')).toEqual([{
      type: 'acp-tool-step', id: RUN_ID, command: 'file read a.md',
      result: 'Agent: command not permitted: file read a.md.', workspace: false,
    }]);
  });

  it('sends the no-tools primer for a withoutTools snapshot', () => {
    const { sent } = start([['Done.']], coreSnapshot('ask', ['db sqlite query'], [], true));

    expect(sent[0]).toBe(`${NO_TOOLS_LINE}\n\n${MARKDOWN_INSTRUCTION}\n\ndo it`);
  });
});

describe('startRemoteLoop caller steps', () => {
  it('sends a caller step as a numbered request and feeds the result into the follow-up prompt', async () => {
    const { frames, sent, handle } = start([[QUERY], ['The answer.']], coreSnapshot('tell', ['db sqlite query']));

    expect(framesOf(frames, 'acp-tool-request')).toEqual([
      { type: 'acp-tool-request', id: RUN_ID, request: 1, command: QUERY },
    ]);

    handle.toolResult({ type: 'acp-tool-result', id: RUN_ID, request: 1, output: '42' });
    await flush();

    expect(sent[1]).toContain(`Output of \`${QUERY}\`:\n42`);
    expect(framesOf(frames, 'acp-tool-step')).toEqual([]);
    expect(frames.at(-1)).toEqual({ type: 'acp-run-end', id: RUN_ID, reason: 'answered' });
  });

  it('numbers a second caller round trip as request 2', async () => {
    const { frames, sent, handle } = start([[QUERY], [QUERY], ['Done.']], coreSnapshot('tell', ['db sqlite query']));

    handle.toolResult({ type: 'acp-tool-result', id: RUN_ID, request: 1, output: 'first' });
    await flush();

    expect(sent[1]).toContain(`Output of \`${QUERY}\`:\nfirst`);
    expect(framesOf(frames, 'acp-tool-request').map((frame) => frame.request)).toEqual([1, 2]);

    handle.toolResult({ type: 'acp-tool-result', id: RUN_ID, request: 2, output: 'second' });
    await flush();

    expect(sent[2]).toContain('second');
    expect(frames.at(-1)).toEqual({ type: 'acp-run-end', id: RUN_ID, reason: 'answered' });
  });

  it('resolves an empty output as a successful step', async () => {
    const { frames, sent, handle } = start([[QUERY], ['Done.']], coreSnapshot('tell', ['db sqlite query']));

    handle.toolResult({ type: 'acp-tool-result', id: RUN_ID, request: 1, output: '' });
    await flush();

    expect(sent).toHaveLength(2);
    expect(sent[1].startsWith(`Output of \`${QUERY}\`:\n\n`)).toBe(true);
    expect(frames.at(-1)).toEqual({ type: 'acp-run-end', id: RUN_ID, reason: 'answered' });
  });

  it('ends the run with a non-fatal error when the result carries an error', async () => {
    const { frames, handle } = start([[QUERY], ['Done.']], coreSnapshot('tell', ['db sqlite query']));

    handle.toolResult({ type: 'acp-tool-result', id: RUN_ID, request: 1, error: 'database unavailable' });
    await flush();

    expect(frames.at(-1)).toEqual({ type: 'acp-error', id: RUN_ID, message: 'database unavailable', fatal: false });
    expect(framesOf(frames, 'acp-run-end')).toEqual([]);
  });

  it('ignores a result for an unknown or already settled request', async () => {
    const { frames, sent, handle } = start([[QUERY], ['Done.']], coreSnapshot('tell', ['db sqlite query']));

    handle.toolResult({ type: 'acp-tool-result', id: RUN_ID, request: 99, output: 'stray' });
    expect(framesOf(frames, 'acp-tool-request')).toHaveLength(1);

    handle.toolResult({ type: 'acp-tool-result', id: RUN_ID, request: 1, output: '42' });
    await flush();
    handle.toolResult({ type: 'acp-tool-result', id: RUN_ID, request: 1, output: 'late' });

    expect(sent).toHaveLength(2);
    expect(sent[1]).toContain('42');
    expect(sent[1]).not.toContain('late');
  });
});

describe('startRemoteLoop frame order', () => {
  it('emits turn, delta chunks, end, request, and the follow-up turn in order', async () => {
    const { frames, handle } = start([
      ['Looking at the data.\n', QUERY],
      ['Done.'],
    ], coreSnapshot('tell', ['db sqlite query']));

    expect(frames).toEqual([
      { type: 'acp-turn', id: RUN_ID, phase: 'start', first: true },
      { type: 'acp-chunk', id: RUN_ID, text: 'Looking at the data.\n' },
      { type: 'acp-chunk', id: RUN_ID, text: QUERY },
      { type: 'acp-turn', id: RUN_ID, phase: 'end', display: 'Looking at the data.' },
      { type: 'acp-tool-request', id: RUN_ID, request: 1, command: QUERY },
    ]);

    handle.toolResult({ type: 'acp-tool-result', id: RUN_ID, request: 1, output: '42' });
    await flush();

    expect(frames.slice(5)).toEqual([
      { type: 'acp-turn', id: RUN_ID, phase: 'start', first: false },
      { type: 'acp-chunk', id: RUN_ID, text: 'Done.' },
      { type: 'acp-turn', id: RUN_ID, phase: 'end', display: 'Done.' },
      { type: 'acp-run-end', id: RUN_ID, reason: 'answered' },
    ]);
  });
});

describe('startRemoteLoop agent runs', () => {
  it('runs an agent file read in the workspace', () => {
    writeFileSync(path.join(workspace, 'a.md'), 'one\n');

    const { frames } = start([['janissary file read a.md'], ['Done.']], agentSnapshot(['file']));

    expect(framesOf(frames, 'acp-tool-step')).toEqual([{
      type: 'acp-tool-step', id: RUN_ID, command: 'file read a.md', result: '1\tone', workspace: true,
    }]);
  });

  it('forwards an agent db reply as a caller request', async () => {
    const { frames, handle } = start([['janissary db sqlite list'], ['Done.']], agentSnapshot(['db']));

    expect(framesOf(frames, 'acp-tool-request')).toEqual([
      { type: 'acp-tool-request', id: RUN_ID, request: 1, command: 'db sqlite list' },
    ]);

    handle.toolResult({ type: 'acp-tool-result', id: RUN_ID, request: 1, output: 'movies' });
    await flush();

    expect(framesOf(frames, 'acp-tool-step')).toEqual([]);
    expect(frames.at(-1)).toEqual({ type: 'acp-run-end', id: RUN_ID, reason: 'answered' });
  });

  it('strips a leading slash from an agent file read before reading the workspace', () => {
    writeFileSync(path.join(workspace, 'a.md'), 'one\n');

    const { frames } = start([['janissary /file read a.md'], ['Done.']], agentSnapshot(['file']));

    const steps = framesOf(frames, 'acp-tool-step');
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ workspace: true, result: '1\tone' });
  });

  it.each([
    ['granted', ['file']],
    ['ungranted', []],
  ])('refuses an extracted file grep without a workspace read or caller request when %s', (_label, grants) => {
    writeFileSync(path.join(workspace, 'a.md'), 'TODO\n');
    mocks.globWorkspaceCommand.mockClear();
    mocks.grepWorkspaceCommand.mockClear();
    const read = vi.spyOn(fileRead, 'readWorkspaceCommand');
    try {
      const { frames, sent } = start([['janissary file grep TODO'], ['Done.']], agentSnapshot(grants));
      const refusal = 'Agent: command not permitted: file grep TODO.';

      expect(framesOf(frames, 'acp-tool-step')).toEqual([{
        type: 'acp-tool-step', id: RUN_ID, command: 'file grep TODO', result: refusal, workspace: false,
      }]);
      expect(framesOf(frames, 'acp-tool-request')).toEqual([]);
      expect(sent[1]).toContain(`Output of \`file grep TODO\`:\n${refusal}`);
      expect(frames.at(-1)).toEqual({ type: 'acp-run-end', id: RUN_ID, reason: 'answered' });
      expect(read).not.toHaveBeenCalled();
      expect(mocks.globWorkspaceCommand).not.toHaveBeenCalled();
      expect(mocks.grepWorkspaceCommand).not.toHaveBeenCalled();
    } finally {
      read.mockRestore();
    }
  });
});

describe('startRemoteLoop cancellation', () => {
  it('cancels a turn once, ending the run only after the provider cancellation settles', async () => {
    const run = startHeld(coreSnapshot('tell', []));
    const cancelled = run.handle.cancel();

    expect(run.handle.cancel()).toBe(cancelled);
    await flush();
    expect(framesOf(run.frames, 'acp-run-end')).toEqual([]);

    run.cancellation.resolve();
    await cancelled;

    expect(framesOf(run.frames, 'acp-run-end')).toEqual([
      { type: 'acp-run-end', id: RUN_ID, reason: 'cancelled' },
    ]);
    expect(run.cancels()).toBe(1);

    const before = run.frames.length;
    run.last().onEnd('end_turn');
    run.last().onChunk('late');
    run.last().onError('late failure');
    await flush();

    expect(run.frames).toHaveLength(before);
    expect(run.sent).toHaveLength(1);
  });

  it('cancels a run waiting on a caller result and ignores a late result', async () => {
    const run = startHeld(coreSnapshot('tell', ['db sqlite query']));
    run.last().onChunk(QUERY);
    run.last().onEnd('end_turn');
    await flush();
    expect(framesOf(run.frames, 'acp-tool-request')).toHaveLength(1);

    const cancelled = run.handle.cancel();
    run.cancellation.resolve();
    await flush();

    expect(framesOf(run.frames, 'acp-run-end')).toEqual([
      { type: 'acp-run-end', id: RUN_ID, reason: 'cancelled' },
    ]);
    expect(run.sent).toHaveLength(1);

    run.handle.toolResult({ type: 'acp-tool-result', id: RUN_ID, request: 1, output: 'late' });
    await cancelled;

    expect(run.sent).toHaveLength(1);
    expect(framesOf(run.frames, 'acp-run-end')).toHaveLength(1);
  });

  it('aborts a run waiting on a caller result without sending a frame', async () => {
    const run = startHeld(coreSnapshot('tell', ['db sqlite query']));
    run.last().onChunk(QUERY);
    run.last().onEnd('end_turn');
    await flush();
    const before = run.frames.length;

    run.handle.abort();
    await flush();

    expect(run.frames).toHaveLength(before);
    expect(run.sent).toHaveLength(1);
    expect(run.cancels()).toBe(0);

    run.handle.toolResult({ type: 'acp-tool-result', id: RUN_ID, request: 1, output: 'late' });
    run.last().onError('late failure');
    await flush();

    expect(run.frames).toHaveLength(before);
    expect(run.sent).toHaveLength(1);
  });

  it('rejects without a run-end when the provider cancellation fails', async () => {
    const run = startHeld(coreSnapshot('tell', []));
    const cancelled = run.handle.cancel();
    run.cancellation.reject(new Error('write failed'));

    await expect(cancelled).rejects.toThrow('write failed');
    expect(framesOf(run.frames, 'acp-run-end')).toEqual([]);
  });
});

const WRITE = `file write ${JSON.stringify({ path: 'b.md', content: 'hello\n' })}`;
const EDIT = `file edit ${JSON.stringify({ path: 'a.md', oldString: 'one', newString: 'uno' })}`;

describe('startRemoteLoop workspace mutations', () => {
  it('runs a granted file write on the workspace as a workspace step', async () => {
    const { frames } = start([[WRITE], ['Done.']], coreSnapshot('tell', ['file write']));
    await flush();

    expect(readFileSync(path.join(workspace, 'b.md'), 'utf8')).toBe('hello\n');
    expect(framesOf(frames, 'acp-tool-step')).toEqual([
      { type: 'acp-tool-step', id: RUN_ID, command: WRITE, result: 'Wrote b.md.', workspace: true },
    ]);
    expect(framesOf(frames, 'acp-tool-request')).toEqual([]);
  });

  it('runs a granted file edit on the workspace as a workspace step', async () => {
    writeFileSync(path.join(workspace, 'a.md'), 'one\ntwo\n');

    const { frames } = start([[EDIT], ['Done.']], coreSnapshot('tell', ['file edit']));
    await flush();

    expect(readFileSync(path.join(workspace, 'a.md'), 'utf8')).toBe('uno\ntwo\n');
    expect(framesOf(frames, 'acp-tool-step')).toEqual([
      { type: 'acp-tool-step', id: RUN_ID, command: EDIT, result: 'Edited a.md (1 replacements).', workspace: true },
    ]);
  });

  it('answers malformed JSON with the write usage line and writes nothing', async () => {
    const { frames } = start([['file write {nope'], ['Done.']], coreSnapshot('tell', ['file write']));
    await flush();

    expect(framesOf(frames, 'acp-tool-step')).toEqual([{
      type: 'acp-tool-step', id: RUN_ID, command: 'file write {nope', result: 'Usage: file write <JSON>', workspace: true,
    }]);
    expect(existsSync(path.join(workspace, 'b.md'))).toBe(false);
  });

  it('refuses an ungranted mutation and writes nothing', async () => {
    const { frames } = start([[WRITE], ['Done.']], coreSnapshot('tell', ['file read']));
    await flush();

    expect(framesOf(frames, 'acp-tool-step')).toEqual([{
      type: 'acp-tool-step', id: RUN_ID, command: WRITE,
      result: 'Command not allowed for role "tell": file write.', workspace: false,
    }]);
    expect(existsSync(path.join(workspace, 'b.md'))).toBe(false);
  });

  it('refuses every mutation on an agent snapshot', async () => {
    const { frames } = start([[`janissary ${WRITE}`], ['Done.']], agentSnapshot(['file']));
    await flush();

    expect(framesOf(frames, 'acp-tool-step')).toEqual([{
      type: 'acp-tool-step', id: RUN_ID, command: WRITE,
      result: `Agent: command not permitted: ${WRITE}.`, workspace: false,
    }]);
    expect(existsSync(path.join(workspace, 'b.md'))).toBe(false);
  });

  it('still forwards a db command after a write as request 1', async () => {
    const { frames } = start([[WRITE], [QUERY], ['Done.']], coreSnapshot('tell', ['file write', 'db sqlite query']));
    await flush();

    expect(existsSync(path.join(workspace, 'b.md'))).toBe(true);
    expect(framesOf(frames, 'acp-tool-request')).toEqual([
      { type: 'acp-tool-request', id: RUN_ID, request: 1, command: QUERY },
    ]);
  });

  it('keeps the written file and suppresses later frames after an abort', async () => {
    const run = startHeld(coreSnapshot('tell', ['file write']));
    run.last().onChunk(WRITE);
    run.last().onEnd('end_turn');
    await flush();
    expect(framesOf(run.frames, 'acp-tool-step')).toHaveLength(1);
    const before = run.frames.length;

    run.handle.abort();
    run.last().onChunk('Done.');
    run.last().onEnd('end_turn');
    await flush();

    expect(run.frames).toHaveLength(before);
    expect(readFileSync(path.join(workspace, 'b.md'), 'utf8')).toBe('hello\n');
  });

  it('writes only the far workspace and leaves a same-named local sentinel alone', async () => {
    const local = mkdtempSync(path.join(tmpdir(), 'janus-serve-acp-loop-local-'));
    try {
      writeFileSync(path.join(local, 'b.md'), 'local');
      start([[WRITE], ['Done.']], coreSnapshot('tell', ['file write']));
      await flush();

      expect(readFileSync(path.join(workspace, 'b.md'), 'utf8')).toBe('hello\n');
      expect(readFileSync(path.join(local, 'b.md'), 'utf8')).toBe('local');
      expect(readdirSync(local)).toEqual(['b.md']);
      expect(readdirSync(workspace)).toEqual(['b.md']);
    } finally {
      rmSync(local, { recursive: true, force: true });
    }
  });

  it('refuses outside-workspace and secret paths and creates nothing', async () => {
    const escape = `file write ${JSON.stringify({ path: '../escape.md', content: 'x' })}`;
    const secret = `file write ${JSON.stringify({ path: '.env', content: 'x' })}`;
    const parent = path.dirname(workspace);
    const { frames } = start([[escape], [secret], ['Done.']], coreSnapshot('tell', ['file write']));
    await flush();

    const steps = framesOf(frames, 'acp-tool-step');
    expect(steps.map((step) => step.command)).toEqual([escape, secret]);
    expect(steps[0]?.result).toMatch(/^Outside the workspace/);
    expect(steps[1]?.result).toMatch(/^Secret file/);
    expect(existsSync(path.join(parent, 'escape.md'))).toBe(false);
    expect(existsSync(path.join(workspace, '.env'))).toBe(false);
    expect(readdirSync(workspace)).toEqual([]);
  });
});

describe('startRemoteLoop workspace glob routing', () => {
  it('runs a granted file glob against the workspace as a workspace step', async () => {
    writeFileSync(path.join(workspace, 'a.md'), 'one\ntwo\n');
    writeFileSync(path.join(workspace, 'b.txt'), 'other\n');
    const { frames } = start([['file glob *.md'], ['Done.']], coreSnapshot('tell', ['file glob']));

    await vi.waitFor(() => expect(framesOf(frames, 'acp-tool-step')).toEqual([
      { type: 'acp-tool-step', id: RUN_ID, command: 'file glob *.md', result: 'a.md', workspace: true },
    ]));
    expect(framesOf(frames, 'acp-tool-request')).toEqual([]);
  });

  it('passes the run abort signal to the workspace glob', async () => {
    writeFileSync(path.join(workspace, 'a.md'), 'one\n');
    mocks.globWorkspaceCommand.mockClear();
    const { frames, handle } = start([['file glob *.md'], ['Done.']], coreSnapshot('tell', ['file glob']));

    await vi.waitFor(() => expect(framesOf(frames, 'acp-tool-step')).toHaveLength(1));
    expect(mocks.globWorkspaceCommand).toHaveBeenCalledWith(workspace, 'file glob *.md', expect.any(AbortSignal));
    const signal = mocks.globWorkspaceCommand.mock.calls[0]?.[2] as AbortSignal;
    expect(signal.aborted).toBe(false);
    handle.abort();
    expect(signal.aborted).toBe(true);
  });
});

function regexMessage(pattern: string): string {
  try {
    new RegExp(pattern, 'i');
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error(`Expected ${pattern} to be an invalid regular expression`);
}

const GREP = 'file grep TODO';

describe('startRemoteLoop workspace grep routing', () => {
  it('searches the far workspace, not a conflicting caller fixture, in a two-argument delegation', async () => {
    writeFileSync(path.join(workspace, 'a.txt'), 'workspace TODO\n');
    const caller = mkdtempSync(path.join(tmpdir(), 'janus-serve-acp-loop-caller-'));
    try {
      writeFileSync(path.join(caller, 'a.txt'), 'caller TODO\n');
      mocks.grepWorkspaceCommand.mockClear();
      const { frames, sent } = start([[GREP], ['Done.']], coreSnapshot('tell', ['file grep']));

      await vi.waitFor(() => expect(framesOf(frames, 'acp-tool-step')).toHaveLength(1));
      expect(framesOf(frames, 'acp-tool-step')).toEqual([{
        type: 'acp-tool-step', id: RUN_ID, command: GREP, result: 'a.txt:1: workspace TODO', workspace: true,
      }]);
      expect(mocks.grepWorkspaceCommand).toHaveBeenCalledWith(workspace, GREP);
      expect(mocks.grepWorkspaceCommand.mock.calls[0]).toHaveLength(2);
      expect(framesOf(frames, 'acp-tool-request')).toEqual([]);
      expect(sent[1]).toContain('Output of `file grep TODO`:\na.txt:1: workspace TODO');
      expect(readdirSync(caller)).toEqual(['a.txt']);
      expect(readFileSync(path.join(caller, 'a.txt'), 'utf8')).toBe('caller TODO\n');
    } finally {
      rmSync(caller, { recursive: true, force: true });
    }
  });

  it('answers the grep usage line for a bare command', async () => {
    const { frames } = start([['file grep'], ['Done.']], coreSnapshot('tell', ['file grep']));

    await vi.waitFor(() => expect(framesOf(frames, 'acp-tool-step')).toHaveLength(1));
    expect(framesOf(frames, 'acp-tool-step')).toEqual([{
      type: 'acp-tool-step', id: RUN_ID, command: 'file grep', result: FILE_GREP_USAGE, workspace: true,
    }]);
  });

  it('prints the missing-path text', async () => {
    const { frames } = start([['file grep --path missing TODO'], ['Done.']], coreSnapshot('tell', ['file grep']));

    await vi.waitFor(() => expect(framesOf(frames, 'acp-tool-step')).toHaveLength(1));
    expect(framesOf(frames, 'acp-tool-step')[0]?.result).toBe('Path not found: missing.');
  });

  it('reports a malformed regex before a contained secret is read', async () => {
    writeFileSync(path.join(workspace, '.env'), 'TODO=secret\n');
    const discover = vi.spyOn(fileGrepCandidates, 'discoverGrepCandidates');
    const scan = vi.spyOn(fileGrepScan, 'scanFiles');
    try {
      const { frames } = start([['file grep [unclosed'], ['Done.']], coreSnapshot('tell', ['file grep']));

      await vi.waitFor(() => expect(framesOf(frames, 'acp-tool-step')).toHaveLength(1));
      expect(framesOf(frames, 'acp-tool-step')[0]?.result)
        .toBe(`${regexMessage('[unclosed')}\nUse --literal to search for the text as typed.`);
      expect(discover).not.toHaveBeenCalled();
      expect(scan).not.toHaveBeenCalled();
    } finally {
      discover.mockRestore();
      scan.mockRestore();
    }
  });

  it('reports an empty-matching regex before a missing path', async () => {
    const { frames } = start([['file grep --path missing x*'], ['Done.']], coreSnapshot('tell', ['file grep']));

    await vi.waitFor(() => expect(framesOf(frames, 'acp-tool-step')).toHaveLength(1));
    expect(framesOf(frames, 'acp-tool-step')[0]?.result)
      .toBe('Pattern matches empty text, so it would match every line: x*.');
  });

  it('reports the workspace regex diagnostic before an absolute path', async () => {
    const { frames } = start([['file grep --path /etc [unclosed'], ['Done.']], coreSnapshot('tell', ['file grep']));

    await vi.waitFor(() => expect(framesOf(frames, 'acp-tool-step')).toHaveLength(1));
    expect(framesOf(frames, 'acp-tool-step')[0]?.result)
      .toBe(`${regexMessage('[unclosed')}\nUse --literal to search for the text as typed.`);
  });

  it('answers no matches', async () => {
    writeFileSync(path.join(workspace, 'a.txt'), 'nothing here\n');
    const { frames } = start([[GREP], ['Done.']], coreSnapshot('tell', ['file grep']));

    await vi.waitFor(() => expect(framesOf(frames, 'acp-tool-step')).toHaveLength(1));
    expect(framesOf(frames, 'acp-tool-step')[0]?.result).toBe('(no matches)');
  });

  it('emits the existing nonfatal acp-error for an unexpected rejection', async () => {
    mocks.grepWorkspaceCommand.mockImplementationOnce(() => Promise.reject(new Error('grep worker stopped')));
    const { frames } = start([[GREP], ['Done.']], coreSnapshot('tell', ['file grep']));

    await vi.waitFor(() => expect(framesOf(frames, 'acp-error')).toHaveLength(1));
    expect(framesOf(frames, 'acp-tool-step')).toEqual([]);
    expect(frames.at(-1)).toEqual({
      type: 'acp-error', id: RUN_ID, message: 'grep worker stopped', fatal: false,
    });
  });

  it('still forwards a later database command as caller request 1', async () => {
    writeFileSync(path.join(workspace, 'a.txt'), 'TODO\n');
    const { frames, handle } = start([[GREP], [QUERY], ['Done.']], coreSnapshot('tell', ['file grep', 'db sqlite query']));

    await vi.waitFor(() => expect(framesOf(frames, 'acp-tool-step')).toHaveLength(1));
    expect(framesOf(frames, 'acp-tool-request')).toEqual([
      { type: 'acp-tool-request', id: RUN_ID, request: 1, command: QUERY },
    ]);
    expect(framesOf(frames, 'acp-tool-step')[0]?.result).toBe('a.txt:1: TODO');

    handle.toolResult({ type: 'acp-tool-result', id: RUN_ID, request: 1, output: '42' });
    await flush();
    expect(frames.at(-1)).toEqual({ type: 'acp-run-end', id: RUN_ID, reason: 'answered' });
  });

  it('refuses an ungranted grep with workspace false and no refused marker', () => {
    const { frames } = start([[GREP], ['Done.']], coreSnapshot('tell', ['file read']));

    expect(framesOf(frames, 'acp-tool-step')).toEqual([{
      type: 'acp-tool-step', id: RUN_ID, command: GREP,
      result: 'Command not allowed for role "tell": file grep.', workspace: false,
    }]);
    expect(mocks.grepWorkspaceCommand).not.toHaveBeenCalled();
  });

  it.each([
    ['disabled', { effectiveEnabled: false, effectiveAgentAccess: true }],
    ['agent-off', { effectiveEnabled: true, effectiveAgentAccess: false }],
  ] as const)('refuses a %s grep with workspace false and the disabled marker', (_label, setting) => {
    const rows = [{ name: 'file grep', ...setting }];
    const { frames } = start([[GREP], ['Done.']], coreSnapshot('tell', ['file grep'], rows));

    expect(framesOf(frames, 'acp-tool-step')).toEqual([{
      type: 'acp-tool-step', id: RUN_ID, command: GREP,
      result: 'Command is disabled: file grep.', workspace: false, refused: 'disabled',
    }]);
    expect(mocks.grepWorkspaceCommand).not.toHaveBeenCalled();
  });
});

describe('startRemoteLoop grep loop preservation', () => {
  it('extracts no grep on a withoutTools snapshot even with the grant', async () => {
    const { frames, sent } = start([[GREP], ['Done.']], coreSnapshot('tell', ['file grep'], [], true));

    await vi.waitFor(() => expect(framesOf(frames, 'acp-run-end')).toHaveLength(1));
    expect(framesOf(frames, 'acp-tool-step')).toEqual([]);
    expect(mocks.grepWorkspaceCommand).not.toHaveBeenCalled();
    expect(sent[0]).toContain(NO_TOOLS_LINE);
    expect(frames.at(-1)).toEqual({ type: 'acp-run-end', id: RUN_ID, reason: 'answered' });
  });

  it('caps eight repeated grep steps and makes a ninth provider turn', async () => {
    const previous = mocks.grepWorkspaceCommand.getMockImplementation();
    mocks.grepWorkspaceCommand.mockImplementation(() => Promise.resolve('a.txt:1: TODO'));
    try {
      const { frames, sent } = start([[GREP]], coreSnapshot('tell', ['file grep']));

      await vi.waitFor(() => expect(framesOf(frames, 'acp-run-end')).toHaveLength(1));
      expect(framesOf(frames, 'acp-tool-step')).toHaveLength(8);
      expect(sent).toHaveLength(9);
      expect(mocks.grepWorkspaceCommand).toHaveBeenCalledTimes(8);
      expect(framesOf(frames, 'acp-run-end')).toEqual([{ type: 'acp-run-end', id: RUN_ID, reason: 'capped' }]);
    } finally {
      if (previous) mocks.grepWorkspaceCommand.mockImplementation(previous);
    }
  });

  it('runs no grep when the run is aborted before execution', async () => {
    const run = startHeld(coreSnapshot('tell', ['file grep']));
    run.last().onChunk(GREP);
    run.handle.abort();
    run.last().onEnd('end_turn');
    await flush();

    expect(mocks.grepWorkspaceCommand).not.toHaveBeenCalled();
    expect(framesOf(run.frames, 'acp-tool-step')).toEqual([]);
    expect(framesOf(run.frames, 'acp-run-end')).toEqual([]);
  });

  it('suppresses a late grep result and the next turn after an abort', async () => {
    const pending = deferred<string>();
    mocks.grepWorkspaceCommand.mockImplementationOnce(() => pending.promise);
    const run = startHeld(coreSnapshot('tell', ['file grep']));
    run.last().onChunk(GREP);
    run.last().onEnd('end_turn');
    await vi.waitFor(() => expect(mocks.grepWorkspaceCommand).toHaveBeenCalledOnce());
    const before = run.frames.length;

    run.handle.abort();
    pending.resolve('a.txt:1: TODO');
    await flush();

    expect(run.frames).toHaveLength(before);
    expect(framesOf(run.frames, 'acp-tool-step')).toEqual([]);
    expect(run.sent).toHaveLength(1);
    expect(framesOf(run.frames, 'acp-run-end')).toEqual([]);
  });
});

describe('startRemoteLoop web routing', () => {
  it('runs a web line with the workspace tokens and the run signal', async () => {
    start([['Done.']], coreSnapshot('tell', ['web search']), { tavily: 'tvly-far' });
    const host = lastHost();

    await expect(host.runWorkspace('web search x')).resolves.toBe('search results');

    expect(mocks.webSearch).toHaveBeenCalledOnce();
    const [request, deps] = mocks.webSearch.mock.calls[0] as [WebSearchCommand, WebSearchDeps];
    expect(request).toEqual(parseWebSearch('web search x'));
    expect(deps.tokens).toEqual({ tavily: 'tvly-far' });
    expect(deps.fetch).toBe(globalThis.fetch);
    expect(deps.signal?.aborted).toBe(false);
    expect(deps).not.toHaveProperty('reportDisabled');
  });

  it('normalizes a leading slash and space before parsing', async () => {
    start([['Done.']], coreSnapshot('tell', ['web search']));
    const host = lastHost();

    await expect(host.runWorkspace(' /web search x')).resolves.toBe('search results');

    const [request] = mocks.webSearch.mock.calls[0] as [WebSearchCommand];
    expect(request).toEqual(parseWebSearch('web search x'));
  });

  it.each(['web', 'web search x --results 30'])('answers %s with the usage line without searching', (line) => {
    start([['Done.']], coreSnapshot('tell', ['web search']));
    const host = lastHost();

    expect(host.runWorkspace(line)).toBe(WEB_SEARCH_USAGE);
    expect(mocks.webSearch).not.toHaveBeenCalled();
  });

  it('aborts the signal passed to the search when the run is aborted', async () => {
    const run = startHeld(coreSnapshot('tell', ['web search']));
    const host = lastHost();

    await host.runWorkspace('web search x');
    const signal = (mocks.webSearch.mock.calls[0] as [WebSearchCommand, WebSearchDeps])[1].signal;
    expect(signal?.aborted).toBe(false);

    run.handle.abort();

    expect(signal?.aborted).toBe(true);
  });

  it('aborts the signal passed to the search when the run is cancelled', async () => {
    const run = startHeld(coreSnapshot('tell', ['web search']));
    const host = lastHost();

    await host.runWorkspace('web search x');
    const signal = (mocks.webSearch.mock.calls[0] as [WebSearchCommand, WebSearchDeps])[1].signal;

    const cancelled = run.handle.cancel();
    expect(signal?.aborted).toBe(true);
    run.cancellation.resolve();
    await cancelled;
  });
});
