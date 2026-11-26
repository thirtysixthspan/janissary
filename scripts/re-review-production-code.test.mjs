import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Each feature-building playbook that repeats a pull request review carries its own rule that a
// re-review runs only when the repairs changed production code, because each runs in a fresh agent
// that reads only its own file. These assertions pin that rule and its non-production paths.

const repoRoot = path.resolve(import.meta.dirname, '..');
const read = (relative) => readFileSync(path.join(repoRoot, relative), 'utf8');

const BUILD_TASKS = ['ai/tasks/feature/build-a-feature.md', 'ai/tasks/feature/build-a-complex-feature.md'];

describe('the re-review production code rule', () => {
  it.each(BUILD_TASKS)('gates re-review on production code changes in %s', (file) => {
    const text = read(file);
    expect(text).toContain('Re-review only when the repairs changed production code');
    expect(text).toContain('git diff --name-only <recorded head SHA>..<current PR head SHA>');
  });

  it.each(BUILD_TASKS)('names the paths that are not production code in %s', (file) => {
    const text = read(file);
    expect(text).toContain('Every listed file outside `./product/`');
    expect(text).toContain('`help/`, and `documentation/` is production code');
    expect(text).toContain('the PR description is not a file and never counts');
  });

  it('no longer runs every focused resolution review unconditionally', () => {
    const text = read('ai/tasks/feature/build-a-complex-feature.md');
    expect(text).not.toContain('Focused subplan cycles always run their resolution review');
    expect(text).toContain('If none is production code, skip the resolution review');
  });
});
