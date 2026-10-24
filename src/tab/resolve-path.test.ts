import { describe, it, expect } from 'vitest';
import { homedir } from 'node:os';
import path from 'node:path';
import { resolveTabPath } from './resolve-path.js';
import type { Managers } from '../managers.js';

// The project directory is `/project`, deliberately not `process.cwd()`, so a fallback to the
// launching process's own directory would show up as a wrong answer rather than a coincidence.
function managersWith(cwd: string | undefined): Pick<Managers, 'tab'> {
  return {
    tab: { launchDir: '/project', workingDirOf: () => cwd ?? '/project' },
  } as unknown as Pick<Managers, 'tab'>;
}

describe('resolveTabPath', () => {
  it('keeps an absolute target as written', () => {
    expect(resolveTabPath(managersWith('/project/src'), 'shell', '/etc/hosts')).toBe('/etc/hosts');
  });

  it('expands $root against the project directory and ~ against home', () => {
    expect(resolveTabPath(managersWith('/project/src'), 'shell', '$root/notes.md')).toBe('/project/notes.md');
    expect(resolveTabPath(managersWith('/project/src'), 'shell', '~/notes.md')).toBe(path.join(homedir(), 'notes.md'));
  });

  it('resolves a relative target against the tab\'s recorded cwd', () => {
    expect(resolveTabPath(managersWith('/project/src'), 'shell', 'a.ts')).toBe('/project/src/a.ts');
  });

  it('resolves a relative target against the project directory when the tab has no cwd', () => {
    expect(resolveTabPath(managersWith(undefined), 'shell', 'notes.md')).toBe('/project/notes.md');
  });
});
