import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AcpSession } from '../acp/types.js';
import type { RoleEntry } from '../plugins/roles/shared.js';

const mocks = vi.hoisted(() => ({
  connectAcp: vi.fn(),
  readRoleSettings: vi.fn(),
  noRoleModels: vi.fn(),
  acpLaunchForEntry: vi.fn(),
}));

vi.mock('../acp/index.js', () => ({ connectAcp: mocks.connectAcp }));
vi.mock('../acp/ask-role.js', () => ({
  readRoleSettings: mocks.readRoleSettings,
  noRoleModels: mocks.noRoleModels,
}));
vi.mock('../acp/launch.js', () => ({ acpLaunchForEntry: mocks.acpLaunchForEntry }));

import { spawnMonitorSession } from './acp.js';
import type { Persona } from '../personas.js';

const ENTRY: RoleEntry = { harness: 'opencode', model: 'ask-model', effort: 'medium' };
const LAUNCH = { command: 'opencode', args: ['acp'], env: { OPENCODE_CONFIG_CONTENT: '{}' } };
const NO_MODELS = 'ACP: the ask role lists no models.';

function makePersona(role: string = 'ask'): Persona {
  return { name: 'test', role, body: 'test body' };
}

function makeSession(): AcpSession {
  return { prompt: vi.fn(), kill: vi.fn(), cancel: vi.fn(async () => {}), shutdown: vi.fn(async () => {}) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readRoleSettings.mockReturnValue({ name: 'ask', entries: [ENTRY], commands: [] });
  mocks.acpLaunchForEntry.mockReturnValue(LAUNCH);
  mocks.noRoleModels.mockImplementation((role: string) => `ACP: the ${role} role lists no models.`);
  mocks.connectAcp.mockReturnValue(makeSession());
});

describe('spawnMonitorSession', () => {
  it('launches from the persona role\'s first entry', () => {
    const session = makeSession();
    mocks.connectAcp.mockReturnValue(session);
    const hooks = { onError: vi.fn() };

    const result = spawnMonitorSession(makePersona(), '/tmp', hooks);

    expect(mocks.readRoleSettings).toHaveBeenCalledWith('/tmp', 'ask');
    expect(mocks.acpLaunchForEntry).toHaveBeenCalledWith(ENTRY);
    expect(mocks.connectAcp).toHaveBeenCalledWith(expect.objectContaining({
      command: 'opencode',
      args: ['acp'],
      cwd: '/tmp',
      onError: hooks.onError,
    }));
    expect(result).toBe(session);
  });

  it('forwards no allowedTools from the persona', () => {
    spawnMonitorSession(makePersona(), '/tmp', { onError: vi.fn() });
    const options = mocks.connectAcp.mock.calls[0][0];
    expect(options).not.toHaveProperty('allowedTools');
  });

  it('passes onConnect hook when provided', () => {
    const onConnect = vi.fn();
    spawnMonitorSession(makePersona(), '/tmp', { onError: vi.fn(), onConnect });
    expect(mocks.connectAcp).toHaveBeenCalledWith(expect.objectContaining({ onConnect }));
  });

  it('reports and throws noRoleModels when the role has no entries', () => {
    mocks.readRoleSettings.mockReturnValue({ name: 'ask', entries: [], commands: [] });
    const onError = vi.fn();

    expect(() => spawnMonitorSession(makePersona(), '/tmp', { onError })).toThrow(NO_MODELS);
    expect(onError).toHaveBeenCalledWith(NO_MODELS);
    expect(mocks.connectAcp).not.toHaveBeenCalled();
  });

  it('reports and throws a harness error when the entry has no adapter', () => {
    mocks.acpLaunchForEntry.mockReturnValue(undefined);
    const onError = vi.fn();

    expect(() => spawnMonitorSession(makePersona(), '/tmp', { onError }))
      .toThrow('no ACP adapter for harness "opencode".');
    expect(onError).toHaveBeenCalledWith('no ACP adapter for harness "opencode".');
    expect(mocks.connectAcp).not.toHaveBeenCalled();
  });

  it('surfaces an agent exit through the monitor\'s onError', () => {
    const onError = vi.fn();
    mocks.connectAcp.mockImplementation((options: { onError: (message: string) => void }) => {
      options.onError('ACP agent exited.');
      return makeSession();
    });

    spawnMonitorSession(makePersona(), '/tmp', { onError });

    expect(onError).toHaveBeenCalledWith('ACP agent exited.');
  });
});
