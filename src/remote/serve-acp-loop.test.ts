import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NO_TOOLS_LINE } from '../acp/internal-tools.js';
import { MARKDOWN_INSTRUCTION } from '../acp/launch.js';
import type { AcpLoopSession, AcpRunSnapshot, AcpRunSnapshotRow } from '../acp/types.js';
import type { ServerFrame } from './protocol-frames.js';
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
  const session: AcpLoopSession = {
    prompt(text, handlers) {
      sent.push(text);
      const deltas = turns[Math.min(index, turns.length - 1)] ?? [];
      index += 1;
      for (const delta of deltas) handlers.onChunk(delta);
      handlers.onEnd('end_turn');
    },
  };
  return { session, sent };
}

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(path.join(tmpdir(), 'janus-serve-acp-loop-'));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

function start(turns: string[][], snapshot: AcpRunSnapshot) {
  const { session, sent } = makeSession(turns);
  const frames: ServerFrame[] = [];
  const handle = startRemoteLoop(
    session,
    { type: 'acp-run', id: RUN_ID, text: 'do it', snapshot },
    workspace,
    (frame) => { frames.push(frame); },
  );
  return { frames, sent, handle };
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
});
