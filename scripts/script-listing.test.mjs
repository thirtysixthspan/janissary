import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runnableScriptNames } from './script-listing.mjs';

const file = (name) => ({ name, isFile: () => true });
const directory = (name) => ({ name, isFile: () => false });

describe('runnableScriptNames', () => {
  it('leaves out directories', () => {
    expect(runnableScriptNames([directory('e2e'), file('check-diff.mjs')])).toEqual(['check-diff']);
  });

  it('leaves out files that are not .mjs or .sh', () => {
    expect(runnableScriptNames([file('README.md'), file('data.json'), file('pr-merge.sh')])).toEqual(['pr-merge']);
  });

  it('lists a name once when a directory shares it with a script', () => {
    expect(runnableScriptNames([directory('release'), file('release.mjs')])).toEqual(['release']);
  });

  it('lists a name once when both a .mjs and a .sh script carry it', () => {
    expect(runnableScriptNames([file('publish.mjs'), file('publish.sh')])).toEqual(['publish']);
  });

  it('leaves out test files', () => {
    expect(runnableScriptNames([file('lint-files.test.mjs'), file('lint-files.mjs')])).toEqual(['lint-files']);
  });

  it('leaves out the runner itself', () => {
    expect(runnableScriptNames([file('run.mjs'), file('publish.mjs')])).toEqual(['publish']);
  });

  it('returns names without extensions, sorted', () => {
    const entries = [file('pr-merge.sh'), file('check-diff.mjs'), file('lint-files.mjs')];
    expect(runnableScriptNames(entries)).toEqual(['check-diff', 'lint-files', 'pr-merge']);
  });
});

describe('scripts/run.mjs with no argument', () => {
  it('lists only runnable scripts, each once', () => {
    const output = execFileSync(process.execPath, [path.join(import.meta.dirname, 'run.mjs')], { encoding: 'utf8' });
    const [heading, ...lines] = output.trimEnd().split('\n');
    const names = lines.map((line) => line.trim());
    expect(heading).toBe('Available scripts:');
    expect(names).toContain('check-diff');
    expect(names.filter((name) => name === 'release')).toHaveLength(1);
    expect(names).not.toContain('e2e');
    expect(names.some((name) => name.endsWith('.test'))).toBe(false);
  });
});
