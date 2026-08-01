import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
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

  it('drops a .gitkeep in each created (empty) directory, except product/backlog', () => {
    const created = scaffoldProject(projectDir);
    for (const dir of created) {
      const expected = dir === 'product/backlog' ? false : true;
      expect(existsSync(path.join(projectDir, dir, '.gitkeep'))).toBe(expected);
    }
  });

  it('seeds product/backlog with the standard backlog files, empty sections', () => {
    scaffoldProject(projectDir);
    for (const name of ['bugs', 'chores', 'documentation', 'features', 'issues', 'technical-debt']) {
      const content = readFileSync(path.join(projectDir, 'product/backlog', `${name}.md`), 'utf8');
      expect(content).toContain(`# ${name}`);
      expect(content).toContain('## ready');
      expect(content).toContain('## development');
      expect(content).toContain('## deferred');
      expect(content).toContain('## declined');
    }
  });

  it('installs the standard Codex and Claude configurations', () => {
    scaffoldProject(projectDir);
    for (const relativePath of ['.codex/config.toml', '.codex/rules/default.rules', '.claude/settings.json']) {
      expect(readFileSync(path.join(projectDir, relativePath), 'utf8'))
        .toBe(readFileSync(path.join(import.meta.dirname, '..', relativePath), 'utf8'));
    }
  });

  it('refreshes standard configuration while preserving custom files', () => {
    const codexRules = path.join(projectDir, '.codex', 'rules');
    mkdirSync(codexRules, { recursive: true });
    mkdirSync(path.join(projectDir, '.claude'), { recursive: true });
    writeFileSync(path.join(projectDir, '.codex', 'config.toml'), 'custom config\n');
    writeFileSync(path.join(codexRules, 'custom.rules'), 'custom rules\n');
    writeFileSync(path.join(projectDir, '.claude', 'settings.json'), '{"custom":true}\n');

    scaffoldProject(projectDir);

    expect(readFileSync(path.join(projectDir, '.codex', 'config.toml'), 'utf8'))
      .toBe(readFileSync(path.join(import.meta.dirname, '..', '.codex/config.toml'), 'utf8'));
    expect(readFileSync(path.join(codexRules, 'custom.rules'), 'utf8')).toBe('custom rules\n');
    expect(existsSync(path.join(codexRules, 'default.rules'))).toBe(true);
    expect(readFileSync(path.join(projectDir, '.claude', 'settings.json'), 'utf8'))
      .toBe(readFileSync(path.join(import.meta.dirname, '..', '.claude/settings.json'), 'utf8'));
  });

  it('is idempotent: running twice does not throw', () => {
    scaffoldProject(projectDir);
    expect(() => scaffoldProject(projectDir)).not.toThrow();
  });

  it('is idempotent: running twice does not overwrite existing backlog file content', () => {
    scaffoldProject(projectDir);
    const issuesPath = path.join(projectDir, 'product/backlog/issues.md');
    writeFileSync(issuesPath, '# issues\n\n## ready\n\n* custom item\n');
    scaffoldProject(projectDir);
    expect(readFileSync(issuesPath, 'utf8')).toContain('custom item');
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });
});
