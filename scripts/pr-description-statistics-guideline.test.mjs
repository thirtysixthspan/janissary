import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Every playbook that writes a pull request description carries its own guideline against restating
// change-set statistics, because each runs in a fresh agent that reads only its own file. These
// assertions pin that wording, its two named exceptions, and the removal of Files changed sections,
// and nothing else: not prose, not structure.

const repoRoot = path.resolve(import.meta.dirname, '..');
const read = (relative) => readFileSync(path.join(repoRoot, relative), 'utf8');

const GUIDELINE = 'This is a guideline, not a hard rule';
const REMOVE_NOT_UPDATE = 'remove the claim rather than updating the number';

const WRITERS = [
  'ai/tasks/workspace/open-feature-pull-request.md',
  'ai/tasks/workspace/merge-change-to-master.md',
  'ai/tasks/feature/update-pull-request.md',
  'ai/tasks/feature/work-pull-request-issue.md',
  'ai/tasks/feature/test-pull-request.md',
  'ai/tasks/hygiene/update-package-outside-range.md',
];

const playbooks = (dir) =>
  readdirSync(path.join(repoRoot, dir), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.relative(repoRoot, path.join(entry.parentPath, entry.name)));

describe('the pull request description statistics guideline', () => {
  it.each(WRITERS)('is stated as a guideline in %s', (file) => {
    const text = read(file);
    expect(text).toMatch(/[Ll]eave change-set statistics out of/);
    expect(text).toContain(GUIDELINE);
  });

  it('keeps the screenshot-link and tested-commit exceptions', () => {
    expect(read('ai/tasks/workspace/open-feature-pull-request.md')).toContain('those are links, not claims, and they stay');
    expect(read('ai/tasks/feature/test-pull-request.md')).toContain("The tested commit's short sha is the one SHA the section carries");
  });

  it('removes a stated statistic instead of correcting it', () => {
    expect(read('ai/tasks/feature/update-pull-request.md')).toContain(REMOVE_NOT_UPDATE);
    expect(read('ai/tasks/feature/work-pull-request-issue.md')).toContain(REMOVE_NOT_UPDATE);
    expect(read('ai/tasks/feature/review-pull-request.md')).toContain('the proposal removes the claim rather than correcting it');
  });

  it('asks no playbook to write a Files changed section', () => {
    for (const file of playbooks('ai/tasks')) {
      expect(read(file), file).not.toMatch(/^#+ Files changed/m);
      expect(read(file), file).not.toContain('Rebuild **Files changed**');
    }
  });

  it('has the update task remove a Files changed section', () => {
    expect(read('ai/tasks/feature/update-pull-request.md')).toContain('Remove a **Files changed** section if the body has one');
  });
});
