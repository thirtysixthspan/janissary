import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validateProfile, reportValidation } from './validate.js';
import { initProfileDir } from '../profiles.js';

describe('validateProfile', () => {
  let root: string;

  const write = (name: string, contents: string) => {
    writeFileSync(path.join(root, 'profiles', `${name}.json`), contents);
  };
  const writeJson = (name: string, obj: unknown) => write(name, JSON.stringify(obj));

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'janus-profvalidate-'));
    initProfileDir(root);
    mkdirSync(path.join(root, 'profiles'), { recursive: true });
  });

  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('returns [] for a valid profile', () => {
    writeJson('ok', {
      tabs: [{ type: 'agent', name: 'bob', active: false }, { type: 'harness', name: 'c', tool: 'claude' }],
      layout: { sidebar: { left: 300 } },
    });
    expect(validateProfile('ok')).toEqual([]);
  });

  it('accepts every tab type in one array', () => {
    writeJson('every', {
      tabs: [
        { type: 'agent', name: 'a' },
        { type: 'harness', name: 'h', tool: 'claude' },
        { type: 'editor', path: 'notes.md' },
        { type: 'files', dock: 'left' },
        { type: 'notifications', dock: 'right', focus: true },
        { type: 'schedules', dock: 'right' },
        { type: 'plugin', id: 'image', path: 'a.png' },
        { type: 'image', path: 'a.png' },
        { type: 'markdown', path: 'readme.md' },
        { type: 'page', url: 'https://example.com' },
        { type: 'ssh', destination: 'host', options: ['-p', '2222'] },
      ],
    });
    expect(validateProfile('every')).toEqual([]);
  });

  it('names the offending field for each malformation', () => {
    writeJson('bad', {
      tabs: [{ type: 'harness', name: 'c', tool: 42 }],
      monitors: [{ persona: 'x', targets: 'group:1' }],
      layout: { window: { width: 'wide', height: 900 } },
    });
    const problems = validateProfile('bad');
    expect(problems).toContain('tabs[0]: tool must be a string');
    expect(problems).toContain('monitors[0]: targets must be an array of strings');
    expect(problems).toContain('layout.window: width must be a number');
  });

  it('reports a non-boolean browser flag on a harness entry', () => {
    writeJson('bad-browser', {
      tabs: [
        { type: 'harness', name: 'a', tool: 'claude', browser: 'yes' },
        { type: 'harness', name: 'b', tool: 'claude', browser: 1 },
      ],
    });
    const problems = validateProfile('bad-browser');
    expect(problems).toContain('tabs[0]: browser must be a boolean');
    expect(problems).toContain('tabs[1]: browser must be a boolean');
  });

  // Unlike autoApprove, no harness rejects it, so a valid entry is valid for every tool.
  it.each(['claude', 'opencode', 'codex'])('accepts browser: true for the %s harness', (tool) => {
    writeJson('ok-browser', { tabs: [{ type: 'harness', name: 'a', tool, browser: true }] });
    expect(validateProfile('ok-browser')).toEqual([]);
  });

  it('reports a missing or unrecognized tab type, naming every valid one', () => {
    writeJson('bad-type', { tabs: [{ name: 'a' }, { type: 'terminal' }] });
    const problems = validateProfile('bad-type');
    const expected = 'type must be one of agent, harness, editor, files, notifications, schedules, plugin, image, markdown, page, ssh';
    expect(problems).toEqual([`tabs[0]: ${expected}`, `tabs[1]: ${expected}`]);
  });

  it('reports a missing per-type required field, located by its array position', () => {
    writeJson('missing', {
      tabs: [
        { type: 'harness', name: 'h' },
        { type: 'editor' },
        { type: 'page' },
        { type: 'ssh' },
        { type: 'plugin', path: 'a.png' },
      ],
    });
    const problems = validateProfile('missing');
    expect(problems).toContain('tabs[0]: tool is required');
    expect(problems).toContain('tabs[1]: path is required');
    expect(problems).toContain('tabs[2]: url is required');
    expect(problems).toContain('tabs[3]: destination is required');
    expect(problems).toContain('tabs[4]: id is required');
  });

  it('locates a bad presentation field at the entry root, not under a tab object', () => {
    writeJson('bad-presentation', { tabs: [{ type: 'agent', name: 'a', number: '2' }] });
    expect(validateProfile('bad-presentation')).toEqual(['tabs[0]: number must be a number']);
  });

  it('validates editor entries and locates malformed editor fields', () => {
    writeJson('bad-editors', {
      tabs: [
        { type: 'editor' }, { type: 'editor', path: 1 }, { type: 'editor', path: 'x', line: '1' },
        { type: 'editor', path: 'x', in: 1 }, { type: 'editor', path: 'x', focus: 'yes' },
      ],
    });
    const problems = validateProfile('bad-editors');
    expect(problems).toContain('tabs[0]: path is required');
    expect(problems).toContain('tabs[1]: path must be a string');
    expect(problems).toContain('tabs[2]: line must be a number');
    expect(problems).toContain('tabs[3]: in must be a string');
    expect(problems).toContain('tabs[4]: focus must be a boolean');
  });

  it('accepts a valid editor entry even when its file does not exist', () => {
    writeJson('new-file', {
      tabs: [
        { type: 'agent', name: 'left', pane: 'left' },
        { type: 'harness', name: 'right', tool: 'claude', pane: 'right' },
        { type: 'editor', path: '$root/not-yet-created.txt', focus: true, pane: 'right' },
      ],
    });
    expect(validateProfile('new-file')).toEqual([]);
  });

  it('rejects invalid pane values for every pane-capable entry kind', () => {
    writeJson('bad-panes', {
      tabs: [
        { type: 'agent', name: 'agent', pane: 'bottom' },
        { type: 'harness', name: 'harness', tool: 'claude', pane: 2 },
        { type: 'editor', path: 'notes.txt', pane: false },
      ],
    });
    expect(validateProfile('bad-panes')).toEqual([
      'tabs[0]: pane must be "left" or "right"',
      'tabs[1]: pane must be "left" or "right"',
      'tabs[2]: pane must be "left" or "right"',
    ]);
  });

  it('accepts a files entry carrying tree state and presentation keys', () => {
    writeJson('tree', {
      tabs: [{
        type: 'files', path: '$root', expanded: ['src', 'src/inner'], cursor: 'src/a.ts',
        anchor: 'src', selected: ['src', 'src/a.ts'], number: 3, group: 2, pane: 'right',
      }],
    });
    expect(validateProfile('tree')).toEqual([]);
  });

  it('locates a malformed tree-state field on a files entry', () => {
    writeJson('bad-tree', {
      tabs: [
        { type: 'files', expanded: 'src' },
        { type: 'files', cursor: 1 },
        { type: 'files', selected: [2] },
        { type: 'files', number: 'first' },
      ],
    });
    const problems = validateProfile('bad-tree');
    expect(problems).toContain('tabs[0]: expanded must be an array of strings');
    expect(problems).toContain('tabs[1]: cursor must be a string');
    expect(problems).toContain('tabs[2]: selected must be an array of strings');
    expect(problems).toContain('tabs[3]: number must be a number');
  });

  it('accepts every detail mode on a files entry and rejects anything else', () => {
    writeJson('detail', {
      tabs: [
        { type: 'files', details: 'name' },
        { type: 'files', details: 'size' },
        { type: 'files', details: 'modified' },
        { type: 'files', details: 'permissions' },
      ],
    });
    expect(validateProfile('detail')).toEqual([]);

    writeJson('bad-detail', { tabs: [{ type: 'files', details: 'owner' }, { type: 'files', details: 2 }] });
    const problems = validateProfile('bad-detail');
    expect(problems).toContain('tabs[0]: details must be "name", "size", "modified" or "permissions"');
    expect(problems).toContain('tabs[1]: details must be "name", "size", "modified" or "permissions"');
  });

  it('reports no problems for a file still using the old per-kind keys', () => {
    writeJson('old', { agents: [{ name: 'bob' }], harnesses: [{ name: 'c' }], editors: [{}] });
    expect(validateProfile('old')).toEqual([]);
  });

  it('returns a single "not valid JSON" item for unparseable JSON', () => {
    write('broken', '{ not json');
    expect(validateProfile('broken')).toEqual(['not valid JSON']);
  });
});

describe('reportValidation', () => {
  let root: string;

  const writeJson = (name: string, obj: unknown) => {
    writeFileSync(path.join(root, 'profiles', `${name}.json`), JSON.stringify(obj));
  };

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'janus-profreport-'));
    initProfileDir(root);
    mkdirSync(path.join(root, 'profiles'), { recursive: true });
  });

  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('reports a single valid profile', () => {
    writeJson('good', { tabs: [{ type: 'agent', name: 'bob', active: false }] });
    expect(reportValidation('good')).toBe('Profile "good" is valid.');
  });

  it('lists the problems of an invalid profile', () => {
    writeJson('bad', { tabs: [{ type: 'harness', name: 'c' }] });
    const report = reportValidation('bad');
    expect(report).toContain('Profile "bad" is not valid:');
    expect(report).toContain('tabs[0]: tool is required');
  });

  it('reports No profile named for an unknown name', () => {
    expect(reportValidation('ghost')).toBe('No profile named "ghost".');
  });

  it('validates every profile when given no name', () => {
    writeJson('alpha', { tabs: [{ type: 'agent', name: 'a', active: false }] });
    writeJson('beta', { tabs: [{ type: 'harness', name: 'c' }] });
    const report = reportValidation(undefined);
    expect(report).toContain('Profile "alpha" is valid.');
    expect(report).toContain('Profile "beta" is not valid:');
  });
});
