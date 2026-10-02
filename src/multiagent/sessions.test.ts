import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AcpOptions, AcpSession } from '../acp/types.js';
import { messageBus } from '../bus.js';
import type { MultiAgentMember } from './types.js';

const mocks = vi.hoisted(() => ({
  connectAcp: vi.fn(),
  sandboxNotice: vi.fn<() => string | undefined>(),
}));
vi.mock('../acp/index.js', () => ({ connectAcp: mocks.connectAcp }));
// The own-tools grant is only safe under real confinement, and this is the helper that reports
// whether there is any. Stubbed rather than exercised against the host so the refusal is testable
// from a darwin machine with isolation enabled.
vi.mock('../sandbox/index.js', () => ({ sandboxNotice: mocks.sandboxNotice }));

import { MultiAgentSessions } from './sessions.js';

type Handlers = Parameters<AcpSession['prompt']>[1];

// A session whose handlers the test drives directly, plus the options it was spawned with.
function fakeSession() {
  const session: AcpSession = { prompt: vi.fn(), kill: vi.fn() };
  return session;
}

const member = (overrides: Partial<MultiAgentMember> = {}): MultiAgentMember => ({
  index: 0, model: 'opencode/big-pickle', state: 'cloning', dir: '/tmp/clone', ...overrides,
});

const lastHandlers = (session: AcpSession): Handlers => {
  const prompt = session.prompt as unknown as { mock: { calls: [string, Handlers][] } };
  return prompt.mock.calls.at(-1)![1];
};

beforeEach(() => {
  mocks.connectAcp.mockReset();
  mocks.sandboxNotice.mockReset();
  mocks.sandboxNotice.mockReturnValue(undefined);
  messageBus.clear();
});

// Every write to a member is a change to what the tab shows, and the client only learns of one when
// the state change goes out with it. Subscribed the way `src/editor/acp-manager.test.ts` does.
function watchState(): ReturnType<typeof vi.fn> {
  const dirty = vi.fn();
  messageBus.on('state', 'dirty', dirty);
  return dirty;
}

describe('MultiAgentSessions', () => {
  it('spawns each member with its own cwd, its own workspaceDir, its model and the opt-in', () => {
    mocks.connectAcp.mockImplementation(() => fakeSession());
    const sessions = new MultiAgentSessions();

    sessions.connect('multi-agent', member({ index: 0, dir: '/tmp/a' }), 'go', false);
    sessions.connect('multi-agent', member({ index: 1, model: 'google/gemini', dir: '/tmp/b' }), 'go', false);

    const options = mocks.connectAcp.mock.calls.map(([value]) => value as AcpOptions);
    expect(options.map(({ cwd, workspaceDir }) => ({ cwd, workspaceDir })))
      .toEqual([{ cwd: '/tmp/a', workspaceDir: '/tmp/a' }, { cwd: '/tmp/b', workspaceDir: '/tmp/b' }]);
    expect(options.every((value) => value.ownTools === true)).toBe(true);
    expect(options[0].env?.OPENCODE_CONFIG_CONTENT).toBe('{"model":"opencode/big-pickle"}');
    expect(options[1].env?.OPENCODE_CONFIG_CONTENT).toBe('{"model":"google/gemini"}');
  });

  it('passes the offline flag through to every member', () => {
    mocks.connectAcp.mockImplementation(() => fakeSession());
    new MultiAgentSessions().connect('multi-agent', member(), 'go', true);
    expect((mocks.connectAcp.mock.calls[0][0] as AcpOptions).offline).toBe(true);
  });

  it('confines a member to the very directory it starts in', () => {
    mocks.connectAcp.mockImplementation(() => fakeSession());
    new MultiAgentSessions().connect('multi-agent', member(), 'go', false);

    const options = mocks.connectAcp.mock.calls[0][0] as AcpOptions;
    expect(options.cwd).toBe(options.workspaceDir);
  });

  // Approving a member's own tool calls is only safe because the process is confined to that
  // member's clone. Without confinement there is no boundary holding it, so the member is refused
  // rather than run wide open — the one combination that exists nowhere else in the application.
  describe('when the member would not be confined', () => {
    beforeEach(() => {
      mocks.sandboxNotice.mockReturnValue('workspace isolation off: sandboxWorkspaces disabled in config');
    });

    it('opens no session at all', () => {
      mocks.connectAcp.mockImplementation(() => fakeSession());
      new MultiAgentSessions().connect('multi-agent', member(), 'go', false);
      expect(mocks.connectAcp).not.toHaveBeenCalled();
    });

    it('fails the member with the isolation reason and announces it', () => {
      const m = member();
      const dirty = watchState();
      new MultiAgentSessions().connect('multi-agent', m, 'go', false);

      expect(m.state).toBe('failed');
      expect(m.error).toBe('workspace isolation off: sandboxWorkspaces disabled in config');
      expect(dirty).toHaveBeenCalledOnce();
    });
  });

  it('refuses a member with no workspace of its own, naming what is missing', () => {
    const m = member({ dir: undefined });
    new MultiAgentSessions().connect('multi-agent', m, 'go', false);

    expect(mocks.connectAcp).not.toHaveBeenCalled();
    expect(m.state).toBe('failed');
    expect(m.error).toBe('Cannot confine a member with no workspace of its own.');
  });

  it('prompts a member exactly once', () => {
    const session = fakeSession();
    mocks.connectAcp.mockReturnValue(session);
    new MultiAgentSessions().connect('multi-agent', member(), 'the prompt', false);
    expect(session.prompt).toHaveBeenCalledOnce();
    expect((session.prompt as unknown as { mock: { calls: [string][] } }).mock.calls[0][0]).toBe('the prompt');
  });

  it('sets the answer and the state when the turn ends', () => {
    const session = fakeSession();
    mocks.connectAcp.mockReturnValue(session);
    const m = member();
    new MultiAgentSessions().connect('multi-agent', m, 'go', false);
    const h = lastHandlers(session);

    h.onChunk('first ');
    h.onChunk('second');
    h.onEnd('end_turn');

    expect(m.state).toBe('answered');
    expect(m.answer).toBe('first second');
  });

  it('announces the settled answer, so a client ever receives it', () => {
    const session = fakeSession();
    mocks.connectAcp.mockReturnValue(session);
    const dirty = watchState();
    new MultiAgentSessions().connect('multi-agent', member(), 'go', false);

    lastHandlers(session).onEnd('end_turn');

    expect(dirty).toHaveBeenCalledOnce();
  });

  it('changes nothing while a chunk streams', () => {
    const session = fakeSession();
    mocks.connectAcp.mockReturnValue(session);
    const m = member();
    new MultiAgentSessions().connect('multi-agent', m, 'go', false);
    const dirty = watchState();

    lastHandlers(session).onChunk('half an ans');

    expect(m.state).toBe('running');
    expect(m.answer).toBeUndefined();
    expect(dirty).not.toHaveBeenCalled();
  });

  it('marks a member failed with the reason when its prompt errors', () => {
    const session = fakeSession();
    mocks.connectAcp.mockReturnValue(session);
    const m = member();
    new MultiAgentSessions().connect('multi-agent', m, 'go', false);

    lastHandlers(session).onError('the agent refused');

    expect(m.state).toBe('failed');
    expect(m.error).toBe('the agent refused');
  });

  it('announces a prompt failure as well', () => {
    const session = fakeSession();
    mocks.connectAcp.mockReturnValue(session);
    const dirty = watchState();
    new MultiAgentSessions().connect('multi-agent', member(), 'go', false);

    lastHandlers(session).onError('the agent refused');

    expect(dirty).toHaveBeenCalledOnce();
  });

  it('marks a member failed and drops it when its agent dies', () => {
    let onError: ((message: string) => void) | undefined;
    mocks.connectAcp.mockImplementation((options: AcpOptions) => {
      onError = options.onError;
      return fakeSession();
    });
    const m = member();
    const dirty = watchState();
    const sessions = new MultiAgentSessions();
    sessions.connect('multi-agent', m, 'go', false);

    onError!('ACP agent exited.');

    expect(m.state).toBe('failed');
    expect(m.error).toBe('ACP agent exited.');
    expect(dirty).toHaveBeenCalledOnce();
  });

  it('does not let a dead predecessor drop its successor', () => {
    const errors: ((message: string) => void)[] = [];
    mocks.connectAcp.mockImplementation((options: AcpOptions) => {
      errors.push(options.onError);
      return fakeSession();
    });
    const m = member();
    const dirty = watchState();
    const sessions = new MultiAgentSessions();
    sessions.connect('multi-agent', m, 'first', false);
    sessions.connect('multi-agent', m, 'second', false);

    // The first connection reports its death only after the second replaced it.
    errors[0]('the first agent exited.');

    expect(m.state).toBe('running');
    expect(m.error).toBeUndefined();
    expect(dirty).not.toHaveBeenCalled();
  });

  it('kills every member session of the tab on close and leaves other tabs alone', () => {
    const first = fakeSession();
    const second = fakeSession();
    const other = fakeSession();
    mocks.connectAcp.mockReturnValueOnce(first).mockReturnValueOnce(second).mockReturnValueOnce(other);
    const sessions = new MultiAgentSessions();
    sessions.connect('multi-agent', member({ index: 0 }), 'go', false);
    sessions.connect('multi-agent', member({ index: 1 }), 'go', false);
    sessions.connect('multi-agent-2', member({ index: 0 }), 'go', false);

    sessions.closeTab('multi-agent');

    expect(first.kill).toHaveBeenCalledOnce();
    expect(second.kill).toHaveBeenCalledOnce();
    expect(other.kill).not.toHaveBeenCalled();
  });

  it('kills every session at shutdown', () => {
    const first = fakeSession();
    const second = fakeSession();
    mocks.connectAcp.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const sessions = new MultiAgentSessions();
    sessions.connect('multi-agent', member({ index: 0 }), 'go', false);
    sessions.connect('multi-agent-2', member({ index: 0 }), 'go', false);

    sessions.dispose();

    expect(first.kill).toHaveBeenCalledOnce();
    expect(second.kill).toHaveBeenCalledOnce();
  });
});
