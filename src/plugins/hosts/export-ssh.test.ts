import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { exportSshHosts } from './export-ssh.js';
import type * as configFileModule from './ssh-config-file.js';
import { writeSshConfigFile } from './ssh-config-file.js';

vi.mock('./ssh-config-file.js', async (importOriginal) => {
  const actual = await importOriginal<typeof configFileModule>();
  return { ...actual, writeSshConfigFile: vi.fn(actual.writeSshConfigFile) };
});

const BEGIN = '# BEGIN janissary hosts';
const END = '# END janissary hosts';
const HEADER = '# Managed by Janissary; edits inside this section are replaced on export.';
const DISPLAY = '~/.ssh/config';
const roots: string[] = [];

function directories(): { home: string; root: string } {
  const base = mkdtempSync(path.join(tmpdir(), 'janus-export-ssh-'));
  roots.push(base);
  const home = path.join(base, 'home');
  const root = path.join(base, 'project');
  mkdirSync(home, { recursive: true });
  mkdirSync(root, { recursive: true });
  return { home, root };
}

const homeFile = (home: string) => path.join(home, '.janissary', 'hosts.json');
const targetFile = (root: string) => path.join(root, 'config');

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, typeof value === 'string' ? value : JSON.stringify(value, undefined, 2));
}

function writeConfig(root: string, text: string): string {
  const file = targetFile(root);
  writeFileSync(file, text);
  return file;
}

afterEach(async () => {
  const actual = await vi.importActual<typeof configFileModule>('./ssh-config-file.js');
  vi.mocked(writeSshConfigFile).mockReset().mockImplementation(actual.writeSshConfigFile);
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('exportSshHosts', () => {
  it('mirrors the catalog into the section, dropping orphans and overwriting changed values without a path', () => {
    const { home, root } = directories();
    writeJson(homeFile(home), {
      web1: { user: 'ops', destination: 'web1.corp.example', path: '~/work' },
      beta: { destination: 'beta.example:2222' },
    });
    const file = writeConfig(root, [
      'Host keep',
      '  HostName keep.example',
      BEGIN,
      HEADER,
      'Host stale',
      '    HostName stale.example',
      'Host web1',
      '    HostName old.example',
      '    User someone',
      END,
      'Host tail',
      '',
    ].join('\n'));

    expect(exportSshHosts(root, home, file, DISPLAY, vi.fn())).toEqual({
      ok: true,
      report: 'Exported 2 hosts to ~/.ssh/config.',
    });
    const text = readFileSync(file, 'utf8');
    expect(text).toBe([
      'Host keep',
      '  HostName keep.example',
      BEGIN,
      HEADER,
      'Host beta',
      '    HostName beta.example',
      '    Port 2222',
      '',
      'Host web1',
      '    HostName web1.corp.example',
      '    User ops',
      END,
      'Host tail',
      '',
    ].join('\n'));
    expect(text).not.toContain('~/work');
    expect(text).not.toContain('Host stale');
  });

  it('skips a literal alias outside the section but writes one that appears only inside', () => {
    const { home, root } = directories();
    writeJson(homeFile(home), {
      web2: { destination: 'new.example' },
      inside: { destination: 'inside.example' },
    });
    const file = writeConfig(root, [
      'Host Keep WEB2',
      '  HostName keep.example',
      BEGIN,
      HEADER,
      'Host web2',
      '    HostName stale.example',
      END,
      'Host tail',
      '',
    ].join('\n'));

    expect(exportSshHosts(root, home, file, DISPLAY, vi.fn())).toEqual({
      ok: true,
      report: 'Exported 1 host to ~/.ssh/config; skipped 1.',
    });
    const text = readFileSync(file, 'utf8');
    expect(text).toBe([
      'Host Keep WEB2',
      '  HostName keep.example',
      BEGIN,
      HEADER,
      'Host inside',
      '    HostName inside.example',
      END,
      'Host tail',
      '',
    ].join('\n'));
    expect(text).not.toContain('Host web2');
  });

  it('creates a missing target with the managed section', () => {
    const { home, root } = directories();
    writeJson(homeFile(home), { dev: { destination: 'dev.example' } });
    const file = targetFile(root);
    expect(existsSync(file)).toBe(false);

    expect(exportSshHosts(root, home, file, DISPLAY, vi.fn())).toEqual({
      ok: true,
      report: 'Exported 1 host to ~/.ssh/config.',
    });
    expect(readFileSync(file, 'utf8')).toBe([
      BEGIN, HEADER, 'Host dev', '    HostName dev.example', END, '',
    ].join('\n'));
  });

  it('reports a mocked write failure with the display path and the problem word', () => {
    const { home, root } = directories();
    writeJson(homeFile(home), { dev: { destination: 'dev.example' } });
    const file = writeConfig(root, 'Host keep\n');
    vi.mocked(writeSshConfigFile).mockReturnValueOnce({ problem: 'permission denied' });

    expect(exportSshHosts(root, home, file, DISPLAY, vi.fn())).toEqual({
      ok: false,
      error: 'Could not write ssh config ~/.ssh/config: permission denied.',
    });
    expect(readFileSync(file, 'utf8')).toBe('Host keep\n');
  });

  it('reports one, several, and zero hosts with the exact singular, plural, and empty wording', () => {
    const one = directories();
    writeJson(homeFile(one.home), { solo: { destination: 'solo.example' } });
    expect(exportSshHosts(one.root, one.home, targetFile(one.root), DISPLAY, vi.fn())).toEqual({
      ok: true,
      report: 'Exported 1 host to ~/.ssh/config.',
    });

    const many = directories();
    writeJson(homeFile(many.home), {
      clash: { destination: 'clash.example' },
      one: { destination: 'one.example' },
      two: { destination: 'two.example' },
      three: { destination: 'three.example' },
    });
    writeConfig(many.root, 'Host CLASH\n  HostName old.example\n');
    expect(exportSshHosts(many.root, many.home, targetFile(many.root), DISPLAY, vi.fn())).toEqual({
      ok: true,
      report: 'Exported 3 hosts to ~/.ssh/config; skipped 1.',
    });

    const empty = directories();
    writeJson(homeFile(empty.home), {});
    expect(exportSshHosts(empty.root, empty.home, targetFile(empty.root), DISPLAY, vi.fn())).toEqual({
      ok: true,
      report: 'No hosts to export.',
    });

    const skipped = directories();
    writeJson(homeFile(skipped.home), { clash: { destination: 'clash.example' } });
    writeConfig(skipped.root, 'Host clash\n  HostName old.example\n');
    expect(exportSshHosts(skipped.root, skipped.home, targetFile(skipped.root), DISPLAY, vi.fn())).toEqual({
      ok: true,
      report: 'No hosts to export; skipped 1.',
    });
  });

  it('empties an existing section with no saved hosts and creates nothing without one', () => {
    const withSection = directories();
    writeJson(homeFile(withSection.home), {});
    const file = writeConfig(withSection.root, [
      'Host keep',
      '  HostName keep.example',
      BEGIN,
      HEADER,
      'Host stale',
      '    HostName stale.example',
      END,
      'Host tail',
      '',
    ].join('\n'));
    expect(exportSshHosts(withSection.root, withSection.home, file, DISPLAY, vi.fn())).toEqual({
      ok: true,
      report: 'No hosts to export.',
    });
    expect(readFileSync(file, 'utf8')).toBe([
      'Host keep',
      '  HostName keep.example',
      BEGIN,
      HEADER,
      END,
      'Host tail',
      '',
    ].join('\n'));

    const withoutSection = directories();
    writeJson(homeFile(withoutSection.home), {});
    expect(exportSshHosts(withoutSection.root, withoutSection.home, targetFile(withoutSection.root), DISPLAY, vi.fn())).toEqual({
      ok: true,
      report: 'No hosts to export.',
    });
    expect(existsSync(targetFile(withoutSection.root))).toBe(false);
  });

  it('refuses an unusable catalog, notifies, and leaves the target byte for byte unchanged', () => {
    const { home, root } = directories();
    const catalog = homeFile(home);
    writeJson(catalog, '{ broken');
    const file = writeConfig(root, 'Host keep\n  HostName keep.example\n');
    const before = readFileSync(file, 'utf8');
    const notify = vi.fn();
    vi.mocked(writeSshConfigFile).mockClear();

    expect(exportSshHosts(root, home, file, DISPLAY, notify)).toEqual({
      ok: false,
      error: `Cannot export hosts: ${catalog} is unusable — fix it by hand.`,
    });
    expect(notify).toHaveBeenCalledWith(`Hosts file ${catalog} is unusable: hosts.json is not valid JSON.`);
    expect(writeSshConfigFile).not.toHaveBeenCalled();
    expect(readFileSync(file, 'utf8')).toBe(before);
  });
});
