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
    writeJson('ok', { agents: [{ name: 'bob', active: false }], harnesses: [{ name: 'c', type: 'claude' }], layout: { sidebar: { left: 300 } } });
    expect(validateProfile('ok')).toEqual([]);
  });

  it('names the offending field for each malformation', () => {
    writeJson('bad', {
      harnesses: [{ name: 'c', type: 42 }],
      monitors: [{ persona: 'x', targets: 'group:1' }],
      layout: { window: { width: 'wide', height: 900 } },
    });
    const problems = validateProfile('bad');
    expect(problems).toContain('harnesses[0]: type must be a string');
    expect(problems).toContain('monitors[0]: targets must be an array of strings');
    expect(problems).toContain('layout.window: width must be a number');
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
    writeJson('good', { agents: [{ name: 'bob', active: false }] });
    expect(reportValidation('good')).toBe('Profile "good" is valid.');
  });

  it('lists the problems of an invalid profile', () => {
    writeJson('bad', { harnesses: [{ name: 'c' }] });
    const report = reportValidation('bad');
    expect(report).toContain('Profile "bad" is not valid:');
    expect(report).toContain('harnesses[0]: type is required');
  });

  it('reports No profile named for an unknown name', () => {
    expect(reportValidation('ghost')).toBe('No profile named "ghost".');
  });

  it('validates every profile when given no name', () => {
    writeJson('alpha', { agents: [{ name: 'a', active: false }] });
    writeJson('beta', { harnesses: [{ name: 'c' }] });
    const report = reportValidation(undefined);
    expect(report).toContain('Profile "alpha" is valid.');
    expect(report).toContain('Profile "beta" is not valid:');
  });
});
