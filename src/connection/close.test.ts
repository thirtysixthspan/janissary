import { describe, it, expect, vi } from 'vitest';
import { closeConnection } from './close.js';
import { makeTab } from '../tab.js';
import type { Managers } from '../managers.js';

function makeManagers(overrides: Partial<Managers> = {}): Managers {
  return {
    database: { close: vi.fn(() => false) },
    shell: { close: vi.fn(() => false) },
    acp: { close: vi.fn(() => false) },
    pty: { kill: vi.fn() },
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

  it('closes an open acp connection', () => {
    const managers = makeManagers({ acp: { close: vi.fn(() => true) } } as unknown as Partial<Managers>);
    const out = vi.fn();

    closeConnection('acp', 'anything', managers, 'main', out);

    expect(managers.acp.close).toHaveBeenCalledWith('main');
    expect(out).toHaveBeenCalledWith('Closed connection acp:opencode.');
  });

  it('reports when there is no open acp connection', () => {
    const managers = makeManagers();
    const out = vi.fn();

    closeConnection('acp', 'anything', managers, 'main', out);

    expect(out).toHaveBeenCalledWith('No open connection acp:opencode.');
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
    const managers = makeManagers({ tab: { tabs: [] } } as unknown as Partial<Managers>);
    const out = vi.fn();

    closeConnection('ssh', 'unknown-host', managers, 'main', out);

    expect(out).toHaveBeenCalledWith('No open connection ssh:unknown-host.');
  });

  it('reports the web UI limitation for an unhandled kind', () => {
    const managers = makeManagers();
    const out = vi.fn();

    closeConnection('browser', 'anything', managers, 'main', out);

    expect(out).toHaveBeenCalledWith('Closing browser connections is not yet available in the web UI.');
  });
});
