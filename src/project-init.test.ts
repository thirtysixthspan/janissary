import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { scaffoldProject } from './project-init.js';

let projectDir: string;

beforeEach(() => {
  projectDir = mkdtempSync(path.join(tmpdir(), 'project-init-test-'));
});

describe('scaffoldProject', () => {
  it('creates the full ai/ and product/ directory tree', () => {
    const created = scaffoldProject(projectDir);
    for (const dir of created) {
      expect(existsSync(path.join(projectDir, dir))).toBe(true);
    }
  });

  it('drops a .gitkeep in each created (empty) directory', () => {
    const created = scaffoldProject(projectDir);
    for (const dir of created) {
      expect(existsSync(path.join(projectDir, dir, '.gitkeep'))).toBe(true);
    }
  });

  it('is idempotent: running twice does not throw', () => {
    scaffoldProject(projectDir);
    expect(() => scaffoldProject(projectDir)).not.toThrow();
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });
});
