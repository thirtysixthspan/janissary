import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { stopInstance } from './stop-instance.js';

let projectDir: string;

beforeEach(() => {
  projectDir = mkdtempSync(path.join(tmpdir(), 'stop-instance-test-'));
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
