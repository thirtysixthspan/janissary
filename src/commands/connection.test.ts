import { describe, it, expect, vi, beforeEach } from 'vitest';
import { command } from './connection.js';
import * as connections from '../connections.js';
import type { CommandHandlerContext } from './types.js';

function context(): CommandHandlerContext {
  return {
    tabs: [{ label: 'test' }],
    activeTab: 0,
    updateCurrentTab: vi.fn(),
    shellsRef: { current: new Map() },
    acpRef: { current: new Map() },
    browserRef: { current: new Map() },
    appendLog: vi.fn(),
    finishRunning: vi.fn(),
    closeBrowserWindow: vi.fn().mockResolvedValue('closed'),
    forgetDbConn: vi.fn(),
    setShellActive: vi.fn(),
    setAcpInfo: vi.fn(),
    shellName: 'bash',
  } as unknown as CommandHandlerContext;
}

function output(ctx: CommandHandlerContext, input: string): string {
  let captured = '';
  const updater = (u: (t: Record<string, unknown>) => Record<string, unknown>) => {
    captured = (u({ log: [], scrollOffset: 0 }) as { log: { output: string }[] }).log.at(-1)!.output;
  };
  ctx.updateCurrentTab = updater as never;
  command.handler(input, ctx);
  return captured;
}

describe('connection command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('connection');
  });

  it('matches connection commands', () => {
    expect(command.match('connection close sqlite:mydb')).toBe(true);
    expect(command.match('CONNECTION close sqlite:mydb')).toBe(true);
    expect(command.match('connection list')).toBe(true);
  });

  it('does not match non-connection input', () => {
    expect(command.match('connections')).toBe(false);
    expect(command.match('connect')).toBe(false);
    expect(command.match('clear')).toBe(false);
  });
});

describe('connection command handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('error cases', () => {
    it('shows usage for bare "connection"', () => {
      expect(output(context(), 'connection')).toContain('Usage:');
    });

    it('shows usage for unknown action', () => {
      expect(output(context(), 'connection bogus')).toContain('Usage:');
    });

    it('shows usage for close without target', () => {
      expect(output(context(), 'connection close')).toContain('Usage:');
    });

    it('shows error for malformed kind:id token', () => {
      expect(output(context(), 'connection close badformat')).toContain('Invalid connection');
    });

    it('shows error for unknown connection kind', () => {
      expect(output(context(), 'connection close unknown:foo')).toContain('Unknown connection kind');
    });
  });

  describe('list', () => {
    it('shows "No open connections" when nothing is active', () => {
      expect(output(context(), 'connection list')).toBe('No open connections.');
    });

    it('lists a shell connection', () => {
      const ctx = context();
      ctx.shellsRef.current.set(0, { kill: vi.fn() } as never);
      expect(output(ctx, 'connection list')).toContain('shell:bash');
    });

    it('lists an acp connection', () => {
      const ctx = context();
      ctx.acpRef.current.set(0, { kill: vi.fn() } as never);
      expect(output(ctx, 'connection list')).toContain('acp:opencode');
    });

    it('lists sqlite connections from listOpenConnections', () => {
      vi.spyOn(connections, 'listOpenConnections').mockReturnValue(['mydb', 'other']);
      const out = output(context(), 'connection list');
      expect(out).toContain('sqlite:mydb');
      expect(out).toContain('sqlite:other');
    });

    it('lists a browser window id', () => {
      const ctx = context();
      ctx.browserRef.current.set(0, { browser: { windowIds: () => ['win1', 'win2'] } } as never);
      const out = output(ctx, 'connection list');
      expect(out).toContain('browser:win1');
      expect(out).toContain('browser:win2');
    });
  });

  describe('close sqlite', () => {
    it('closes an existing sqlite connection', () => {
      vi.spyOn(connections, 'closeConnection').mockReturnValue(true);
      const ctx = context();
      const out = output(ctx, 'connection close sqlite:mydb');
      expect(out).toBe('Closed connection sqlite:mydb.');
      expect(ctx.forgetDbConn).toHaveBeenCalledWith('mydb');
    });

    it('reports when sqlite connection does not exist', () => {
      vi.spyOn(connections, 'closeConnection').mockReturnValue(false);
      expect(output(context(), 'connection close sqlite:mydb')).toBe('No open connection sqlite:mydb.');
    });
  });

  describe('close shell', () => {
    it('closes an active shell', () => {
      const proc = { kill: vi.fn() };
      const ctx = context();
      ctx.shellsRef.current.set(0, proc as never);
      const out = output(ctx, 'connection close shell:bash');
      expect(out).toBe('Closed connection shell:bash.');
      expect(proc.kill).toHaveBeenCalledOnce();
      expect(ctx.shellsRef.current.has(0)).toBe(false);
      expect(ctx.setShellActive).toHaveBeenCalled();
    });

    it('reports if a different shell id is given', () => {
      expect(output(context(), 'connection close shell:other')).toBe(
        'No open connection shell:other (this tab\'s shell is "bash").',
      );
    });

    it('reports if the shell id matches but no process is running', () => {
      expect(output(context(), 'connection close shell:bash')).toBe(
        'No open connection shell:bash.',
      );
    });
  });

  describe('close acp', () => {
    it('closes an active acp session', () => {
      const session = { kill: vi.fn() };
      const ctx = context();
      ctx.acpRef.current.set(0, session as never);
      const out = output(ctx, 'connection close acp:opencode');
      expect(out).toBe('Closed connection acp:opencode.');
      expect(session.kill).toHaveBeenCalledOnce();
      expect(ctx.acpRef.current.has(0)).toBe(false);
      expect(ctx.setAcpInfo).toHaveBeenCalled();
    });

    it('reports if a different acp id is given', () => {
      expect(output(context(), 'connection close acp:other')).toBe(
        'No open connection acp:other (the acp agent is "opencode").',
      );
    });

    it('reports if the acp id matches but no session is running', () => {
      expect(output(context(), 'connection close acp:opencode')).toBe(
        'No open connection acp:opencode.',
      );
    });
  });

  describe('close browser', () => {
    it('closes a browser window asynchronously', async () => {
      const ctx = context();
      command.handler('connection close browser:tab42', ctx);
      expect(ctx.appendLog).toHaveBeenCalledWith('test', { input: 'connection close browser:tab42', output: '', running: true });
      expect(ctx.closeBrowserWindow).toHaveBeenCalledWith(0, 'tab42');
      await vi.dynamicImportSettled();
      expect(ctx.finishRunning).toHaveBeenCalledWith('test', 'closed');
    });
  });
});
