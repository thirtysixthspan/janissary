import { describe, it, expect, vi } from 'vitest';
import { closeConnection } from './close.js';
import { makeTab } from '../tab/index.js';
import type { Managers } from '../managers.js';

function makeManagers(overrides: Partial<Managers> = {}): Managers {
  return {
    database: { close: vi.fn(() => false) },
    shell: { close: vi.fn(() => false) },
    acp: { close: vi.fn(() => false), label: vi.fn(() => { /* no named session */ }) },
    editorAcp: { close: vi.fn(() => false) },
    monitor: { stop: vi.fn(() => false) },
    pty: { kill: vi.fn(), killTerminal: vi.fn(() => false) },
    tab: { tabs: [] },
    ...overrides,
  } as unknown as Managers;
}

describe('closeConnection', () => {
  it('closes an open sqlite connection', () => {
    const managers = makeManagers({ database: { close: vi.fn(() => true) } } as unknown as Partial<Managers>);
    const out = vi.fn();

    closeConnection('sqlite', 'mydb', managers, 'main', out);

    expect(managers.database.close).toHaveBeenCalledWith('mydb');
    expect(out).toHaveBeenCalledWith('Closed connection sqlite:mydb.');
  });

  it('reports when there is no open sqlite connection', () => {
    const managers = makeManagers();
    const out = vi.fn();

    closeConnection('sqlite', 'mydb', managers, 'main', out);

    expect(out).toHaveBeenCalledWith('No open connection sqlite:mydb.');
  });

  it('closes an open shell connection', () => {
    const managers = makeManagers({ shell: { close: vi.fn(() => true) } } as unknown as Partial<Managers>);
    const out = vi.fn();

    closeConnection('shell', 'anything', managers, 'main', out);

    expect(managers.shell.close).toHaveBeenCalledWith('main');
    expect(out).toHaveBeenCalledWith(expect.stringContaining('Closed connection shell:'));
  });

  it('reports when there is no open shell connection', () => {
    const managers = makeManagers();
    const out = vi.fn();

    closeConnection('shell', 'anything', managers, 'main', out);

    expect(out).toHaveBeenCalledWith('No open connection shell:anything.');
  });

  it('closes the tab\'s own acp session and names the session that closed', () => {
    const managers = makeManagers({ acp: { close: vi.fn(() => true), label: vi.fn(() => 'anthropic/claude-sonnet') } } as unknown as Partial<Managers>);
    const out = vi.fn();

    closeConnection('acp', 'anthropic/claude-sonnet', managers, 'main', out);

    expect(managers.acp.close).toHaveBeenCalledWith('main');
    expect(out).toHaveBeenCalledWith('Closed connection acp:anthropic/claude-sonnet.');
  });

  it('closes a session still connecting, which has no name yet, under the id typed', () => {
    const managers = makeManagers({ acp: { close: vi.fn(() => true), label: vi.fn(() => { /* not yet named */ }) } } as unknown as Partial<Managers>);
    const out = vi.fn();

    closeConnection('acp', 'agent', managers, 'main', out);

    expect(out).toHaveBeenCalledWith('Closed connection acp:agent.');
  });

  it('reports when there is no open acp connection, naming the id typed', () => {
    const managers = makeManagers();
    const out = vi.fn();

    closeConnection('acp', 'anything', managers, 'main', out);

    expect(out).toHaveBeenCalledWith('No open connection acp:anything.');
  });

  it('stops the tab\'s monitor named by the id and leaves the tab\'s own session alone', () => {
    const stop = vi.fn(() => true);
    const acpClose = vi.fn(() => true);
    const managers = makeManagers({ monitor: { stop }, acp: { close: acpClose, label: vi.fn(() => 'opencode/x') } } as unknown as Partial<Managers>);
    const out = vi.fn();

    closeConnection('acp', 'security', managers, 'main', out);

    expect(stop).toHaveBeenCalledWith('main', 'security');
    expect(acpClose).not.toHaveBeenCalled();
    expect(out).toHaveBeenCalledWith('Closed connection acp:security.');
  });

  it('closes an editor tab\'s persona connection without touching the interactive session', () => {
    const editorAcpClose = vi.fn(() => true);
    const acpClose = vi.fn(() => true);
    const managers = makeManagers({ editorAcp: { close: editorAcpClose }, acp: { close: acpClose } } as unknown as Partial<Managers>);
    const out = vi.fn();

    closeConnection('acp', 'reviewer', managers, 'notes', out);

    expect(editorAcpClose).toHaveBeenCalledWith('notes', 'reviewer');
    expect(acpClose).not.toHaveBeenCalled();
    expect(out).toHaveBeenCalledWith('Closed connection acp:reviewer.');
  });

  it('falls back to the interactive session close when no editor persona or monitor matches', () => {
    const managers = makeManagers({ acp: { close: vi.fn(() => true), label: vi.fn(() => 'opencode/big-pickle') } } as unknown as Partial<Managers>);
    const out = vi.fn();

    closeConnection('acp', 'opencode/big-pickle', managers, 'main', out);

    expect(managers.editorAcp.close).toHaveBeenCalledWith('main', 'opencode/big-pickle');
    expect(managers.monitor.stop).toHaveBeenCalledWith('main', 'opencode/big-pickle');
    expect(managers.acp.close).toHaveBeenCalledWith('main');
    expect(out).toHaveBeenCalledWith('Closed connection acp:opencode/big-pickle.');
  });

  it('closes an ssh connection found by tab label', () => {
    const tab = makeTab('bastion', 'red');
    tab.harness = { name: 'ssh', program: 'ssh', ptyId: 'pty-1', status: 'running' };
    const managers = makeManagers({ tab: { tabs: [tab] } } as unknown as Partial<Managers>);
    const out = vi.fn();

    closeConnection('ssh', 'bastion', managers, 'main', out);

    expect(managers.pty.kill).toHaveBeenCalledWith('pty-1');
    expect(out).toHaveBeenCalledWith('Closed connection ssh:bastion.');
  });

  it('closes an ssh connection found by destination', () => {
    const tab = makeTab('bastion', 'red');
    tab.harness = { name: 'ssh', program: 'ssh', ptyId: 'pty-2', status: 'running', destination: 'host.example.com' };
    const managers = makeManagers({ tab: { tabs: [tab] } } as unknown as Partial<Managers>);
    const out = vi.fn();

    closeConnection('ssh', 'host.example.com', managers, 'main', out);

    expect(managers.pty.kill).toHaveBeenCalledWith('pty-2');
    expect(out).toHaveBeenCalledWith('Closed connection ssh:host.example.com.');
  });

  it('reports when there is no matching ssh connection', () => {
    const managers = makeManagers({ tab: { tabs: [] }, remote: { close: vi.fn(() => false) } } as unknown as Partial<Managers>);
    const out = vi.fn();

    closeConnection('ssh', 'unknown-host', managers, 'main', out);

    expect(out).toHaveBeenCalledWith('No open connection ssh:unknown-host.');
  });

  // A remote tab's `ssh:` row names the channel it runs over, not an ssh tab — killing that channel
  // is what closes the tab.
  it('closes a remote tab\'s channel found by tab label', () => {
    const tab = makeTab('claude', 'red');
    tab.remote = { address: 'admin@devbox:/srv/proj', host: 'devbox' };
    const close = vi.fn(() => true);
    const managers = makeManagers({ tab: { tabs: [tab] }, remote: { close } } as unknown as Partial<Managers>);
    const out = vi.fn();

    closeConnection('ssh', 'claude', managers, 'main', out);

    expect(close).toHaveBeenCalledWith('claude');
    expect(out).toHaveBeenCalledWith('Closed connection ssh:claude.');
  });

  it('closes a remote tab\'s channel found by the address it was launched with', () => {
    const tab = makeTab('claude', 'red');
    tab.remote = { address: 'admin@devbox:/srv/proj', host: 'devbox' };
    const close = vi.fn(() => true);
    const managers = makeManagers({ tab: { tabs: [tab] }, remote: { close } } as unknown as Partial<Managers>);
    const out = vi.fn();

    closeConnection('ssh', 'admin@devbox:/srv/proj', managers, 'main', out);

    expect(close).toHaveBeenCalledWith('claude');
    expect(out).toHaveBeenCalledWith('Closed connection ssh:admin@devbox:/srv/proj.');
  });

  it('closes a tab\'s terminal by its program name', () => {
    const killTerminal = vi.fn(() => true);
    const managers = makeManagers({ pty: { kill: vi.fn(), killTerminal } } as unknown as Partial<Managers>);
    const out = vi.fn();

    closeConnection('terminal', 'vim', managers, 'main', out);

    expect(killTerminal).toHaveBeenCalledWith('main', 'vim');
    expect(out).toHaveBeenCalledWith('Closed connection terminal:vim.');
  });

  it('reports when the tab has no terminal running that program', () => {
    const managers = makeManagers();
    const out = vi.fn();

    closeConnection('terminal', 'vim', managers, 'main', out);

    expect(out).toHaveBeenCalledWith('No open connection terminal:vim.');
  });
});
