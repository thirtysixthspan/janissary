import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AcpOptions, PromptHandlers } from '../acp/types.js';
import type { ServerFrame } from './protocol.js';

// `connectAcp` is faked at the module boundary: what this class owns is the frame translation, not
// the ACP client itself (that is exercised end to end in `src/acp/index.test.ts`).
const acpMock = vi.hoisted(() => ({
  options: [] as AcpOptions[],
  prompt: vi.fn(),
  kill: vi.fn(),
}));
vi.mock('../acp/index.js', () => ({
  connectAcp: vi.fn((options: AcpOptions) => {
    acpMock.options.push(options);
    return { prompt: acpMock.prompt, kill: acpMock.kill };
  }),
}));

import { RemoteAcp } from './serve-acp.js';

const WORKSPACE = '/srv/proj/.janissary/workspace/bekir';

const OPEN = {
  type: 'acp-open', id: 'racp1', command: 'opencode', args: ['acp'],
  env: { OPENCODE_CONFIG_CONTENT: '{"model":"google/gemini-3.1-flash-lite"}' }, offline: false,
} as const;

function makeAcp(tokens = {}) {
  const frames: ServerFrame[] = [];
  const acp = new RemoteAcp((frame) => { frames.push(frame); }, WORKSPACE, tokens);
  return { acp, frames };
}

// The handlers `RemoteAcp` gave the faked session for its most recent prompt.
function lastHandlers(): PromptHandlers {
  return acpMock.prompt.mock.calls.at(-1)![1] as PromptHandlers;
}

beforeEach(() => {
  acpMock.options.length = 0;
  acpMock.prompt.mockReset();
  acpMock.kill.mockReset();
});

describe('RemoteAcp — opening a session', () => {
  it('emits a ready frame once the handshake completes', () => {
    const { acp, frames } = makeAcp();

    acp.open(OPEN);
    acpMock.options[0].onConnect?.({ provider: 'opencode', model: 'Build' });

    expect(frames).toEqual([{ type: 'acp-ready', id: 'racp1' }]);
  });

  // Both, so the agent sees the files the tab is working on and is confined to the clone exactly as
  // this server's other workspaced processes are.
  it('runs the agent in the provisioned workspace as both cwd and sandbox root', () => {
    const { acp } = makeAcp();

    acp.open(OPEN);

    expect(acpMock.options[0]).toMatchObject({
      command: 'opencode',
      args: ['acp'],
      cwd: WORKSPACE,
      workspaceDir: WORKSPACE,
      offline: false,
      env: { OPENCODE_CONFIG_CONTENT: '{"model":"google/gemini-3.1-flash-lite"}' },
    });
  });

  // The forwarded-over-own map this server already computed. Reading its own credentials instead
  // would drop a forwarded key for exactly the sessions that need it most.
  it('injects the merged token map, with a forwarded token beating the remote\'s own', () => {
    const { acp } = makeAcp({ github: 'remote-own', opencode: 'oc_live_forwarded' });

    acp.open(OPEN);

    expect(acpMock.options[0].tokens).toEqual({ github: 'remote-own', opencode: 'oc_live_forwarded' });
  });

  it('ignores a duplicate open for an id that is already live', () => {
    const { acp } = makeAcp();

    acp.open(OPEN);
    acp.open(OPEN);

    expect(acpMock.options).toHaveLength(1);
  });

  // One `remote-serve` serves every tab sharing its channel — the launching tab and each agent
  // joined from it through ➕ — so their sessions arrive here together and must not displace one
  // another. Each carries its own id, minted by the local side.
  it('holds one session per id, so tabs sharing a channel each get their own agent', () => {
    const { acp, frames } = makeAcp();

    acp.open(OPEN);
    acp.open({ ...OPEN, id: 'racp2' });
    acpMock.options[1].onConnect?.({ provider: 'opencode', model: 'Build' });

    expect(acpMock.options).toHaveLength(2);
    expect(frames).toEqual([{ type: 'acp-ready', id: 'racp2' }]);
  });
});

describe('RemoteAcp — prompting', () => {
  it('emits a chunk frame per chunk and an end frame on completion', () => {
    const { acp, frames } = makeAcp();
    acp.open(OPEN);

    acp.prompt({ type: 'acp-prompt', id: 'racp1', text: 'summarize this' });
    lastHandlers().onChunk('first ');
    lastHandlers().onChunk('second');
    lastHandlers().onEnd('end_turn');

    expect(acpMock.prompt.mock.calls[0][0]).toBe('summarize this');
    expect(frames).toEqual([
      { type: 'acp-chunk', id: 'racp1', text: 'first ' },
      { type: 'acp-chunk', id: 'racp1', text: 'second' },
      { type: 'acp-end', id: 'racp1', stopReason: 'end_turn' },
    ]);
  });

  // The split the whole design rests on. A rate limit clears on its own, so the session keeps its
  // accumulated conversation; a dead agent does not, so the local side must forget it.
  it('emits a non-fatal error for a failed prompt and a fatal one for a dead session', () => {
    const { acp, frames } = makeAcp();
    acp.open(OPEN);
    acp.prompt({ type: 'acp-prompt', id: 'racp1', text: 'hi' });

    lastHandlers().onError('rate limited');
    acpMock.options[0].onError('ACP agent exited.');

    expect(frames).toEqual([
      { type: 'acp-error', id: 'racp1', message: 'rate limited', fatal: false },
      { type: 'acp-error', id: 'racp1', message: 'ACP agent exited.', fatal: true },
    ]);
  });

  // Silently dropping it would leave the local side waiting on a reply that is never coming.
  it('emits a fatal error for a prompt addressed to an unknown session', () => {
    const { acp, frames } = makeAcp();

    acp.prompt({ type: 'acp-prompt', id: 'racp9', text: 'hi' });

    expect(frames).toEqual([
      { type: 'acp-error', id: 'racp9', message: 'No remote ACP session is open.', fatal: true },
    ]);
    expect(acpMock.prompt).not.toHaveBeenCalled();
  });

  it('emits a fatal error for a prompt addressed to an id that was closed', () => {
    const { acp, frames } = makeAcp();
    acp.open(OPEN);
    acp.close('racp1');

    acp.prompt({ type: 'acp-prompt', id: 'racp1', text: 'hi' });

    expect(frames.at(-1)).toEqual({ type: 'acp-error', id: 'racp1', message: 'No remote ACP session is open.', fatal: true });
  });

  // Two tabs sharing one channel: each prompt reaches its own agent, and each reply carries the id
  // that routes it back to the tab that asked.
  it('routes a prompt to the session its id names', () => {
    const { acp, frames } = makeAcp();
    acp.open(OPEN);
    acp.open({ ...OPEN, id: 'racp2' });

    acp.prompt({ type: 'acp-prompt', id: 'racp2', text: 'hi' });
    lastHandlers().onEnd('end_turn');

    expect(frames).toEqual([{ type: 'acp-end', id: 'racp2', stopReason: 'end_turn' }]);
  });
});

describe('RemoteAcp — closing', () => {
  it('kills the subprocess once and is safe to call twice', () => {
    const { acp, frames } = makeAcp();
    acp.open(OPEN);

    acp.close('racp1');
    acp.close('racp1');

    expect(acpMock.kill).toHaveBeenCalledTimes(1);
    expect(frames).toEqual([]);
  });

  it('leaves another session\'s id alone', () => {
    const { acp } = makeAcp();
    acp.open(OPEN);

    acp.close('racp2');

    expect(acpMock.kill).not.toHaveBeenCalled();
  });

  it('disposes the live session once and is safe to call twice', () => {
    const { acp, frames } = makeAcp();
    acp.open(OPEN);

    acp.dispose();
    acp.dispose();

    expect(acpMock.kill).toHaveBeenCalledTimes(1);
    expect(frames).toEqual([]);
  });

  // Shutdown takes every tab's agent with it, not only the first one opened.
  it('disposes every live session', () => {
    const { acp } = makeAcp();
    acp.open(OPEN);
    acp.open({ ...OPEN, id: 'racp2' });

    acp.dispose();

    expect(acpMock.kill).toHaveBeenCalledTimes(2);
  });

  it('accepts a fresh open after the previous session was closed', () => {
    const { acp } = makeAcp();
    acp.open(OPEN);
    acp.close('racp1');

    acp.open({ ...OPEN, id: 'racp2' });

    expect(acpMock.options).toHaveLength(2);
  });
});
