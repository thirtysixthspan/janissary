import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { stopInstance } from './stop-instance.js';
import { pidBelongsToCurrentUser } from './process-owner.js';

vi.mock('./process-owner.js', () => ({ pidBelongsToCurrentUser: vi.fn() }));

let projectDir: string;

beforeEach(() => {
  projectDir = mkdtempSync(path.join(tmpdir(), 'stop-instance-test-'));
  vi.mocked(pidBelongsToCurrentUser).mockReset();
});

describe('stopInstance', () => {
  it('signals SIGTERM to a live locked pid', () => {
    const dir = path.join(projectDir, '.janissary');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'lock'), String(process.pid));
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    stopInstance(projectDir);

    expect(killSpy).toHaveBeenCalledWith(process.pid, 'SIGTERM');
    killSpy.mockRestore();
  });

  it('reports no running instance when no lock file exists', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    stopInstance(projectDir);

    expect(writeSpy).toHaveBeenCalledWith(`no running janus instance for ${projectDir}\n`);
    writeSpy.mockRestore();
  });

  // A recycled pid positively owned by another account is not the instance the lock names, and a
  // SIGTERM aimed at it would throw rather than stop anything. The owner must be explicit: in a
  // sandbox that denies `ps`, an unavailable owner is kept as ours so stop can still signal it.
  it('reports no running instance when the locked pid belongs to another account', () => {
    const dir = path.join(projectDir, '.janissary');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'lock'), '999999');
    vi.mocked(pidBelongsToCurrentUser).mockReturnValue(false);
    const kill = vi.spyOn(process, 'kill')
      .mockImplementation(() => { throw Object.assign(new Error('EPERM'), { code: 'EPERM' }); });
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    stopInstance(projectDir);

    expect(writeSpy).toHaveBeenCalledWith(`no running janus instance for ${projectDir}\n`);
    expect(kill).not.toHaveBeenCalledWith(999_999, 'SIGTERM');
    kill.mockRestore();
    writeSpy.mockRestore();
  });

  // This sandbox denies the signal probe and the `ps` query alike. An unreadable owner is not a
  // foreign one, so stop must signal the live instance instead of reporting that nothing runs.
  it('signals the locked pid when the probe is denied and the owner query is unavailable', () => {
    const dir = path.join(projectDir, '.janissary');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'lock'), '424242');
    vi.mocked(pidBelongsToCurrentUser).mockReturnValue(undefined);
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    stopInstance(projectDir);

    expect(kill).toHaveBeenCalledWith(424_242, 'SIGTERM');
    expect(writeSpy).not.toHaveBeenCalled();
    kill.mockRestore();
    writeSpy.mockRestore();
  });

  // An empty lock parses to 0, which `process.kill` would take as this process's own group — so the
  // stub goes in before the file exists, and no signal of any kind may be sent.
  it('reports no running instance for an empty lock file without signalling anything', () => {
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const dir = path.join(projectDir, '.janissary');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'lock'), '');

    stopInstance(projectDir);

    expect(kill).not.toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalledWith(`no running janus instance for ${projectDir}\n`);
    kill.mockRestore();
    writeSpy.mockRestore();
  });

  it('reports no running instance when the locked pid is dead', () => {
    const dir = path.join(projectDir, '.janissary');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'lock'), '999999');
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    stopInstance(projectDir);

    expect(writeSpy).toHaveBeenCalledWith(`no running janus instance for ${projectDir}\n`);
    writeSpy.mockRestore();
  });
});
