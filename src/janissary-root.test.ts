import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { janissaryRoot, janissaryAiDir, JANISSARY_HOME_ENV } from './janissary-root.js';

describe('janissaryRoot', () => {
  // The root is derived from this module's own location, so the assertion has to be about what
  // lives there rather than about a path string: a module that moved into a subdirectory would
  // still return a plausible-looking absolute path, just one level short of the installation.
  it('names the directory the installation is laid out under', () => {
    const root = janissaryRoot();
    expect(path.isAbsolute(root)).toBe(true);
    expect(existsSync(path.join(root, 'package.json'))).toBe(true);
    expect(existsSync(path.join(root, 'ai', 'tasks'))).toBe(true);
  });

  it('points janissaryAiDir at that root\'s ai/ directory', () => {
    expect(janissaryAiDir()).toBe(path.join(janissaryRoot(), 'ai'));
  });

  // Lowercase on purpose: the task picker inserts `execute $janissary/...`, and a shell expands the
  // name exactly as written.
  it('names the environment variable the inserted command spells', () => {
    expect(JANISSARY_HOME_ENV).toBe('janissary');
  });
});
