import { describe, expect, it } from 'vitest';
import { changelogSection, isReleaseCommit, isSyncCommit } from './changelog.mjs';

const VERSION = '0.13.0';
const DATE = '2026-09-08';

const section = (subjects) => changelogSection(VERSION, DATE, subjects);
const entries = (markdown) => markdown.split('\n').filter((line) => line.startsWith('- '));
const headings = (markdown) => markdown.split('\n').filter((line) => line.startsWith('### '));

describe('isSyncCommit', () => {
  it('recognizes the `sync: <filename>` subject the editor\'s save cycle writes', () => {
    expect(isSyncCommit('sync: issues.md')).toBe(true);
    expect(isSyncCommit('sync: technical-debt.md')).toBe(true);
  });

  it('recognizes a scoped or breaking variant of the same type', () => {
    expect(isSyncCommit('sync(backlog): issues.md')).toBe(true);
    expect(isSyncCommit('sync!: issues.md')).toBe(true);
  });

  it('leaves a subject whose scope merely names the sync feature alone', () => {
    expect(isSyncCommit('feat(git-sync): share one workspace clone')).toBe(false);
    expect(isSyncCommit('refactor(git): move the git cluster into src/git/ (#1040)')).toBe(false);
  });

  it('leaves a subject that only contains the word alone', () => {
    expect(isSyncCommit('fix: report asynchronous profile failures (#871)')).toBe(false);
    expect(isSyncCommit('docs: explain how a synced file is committed')).toBe(false);
  });
});

describe('changelogSection', () => {
  it('leaves sync commits out of the Other section and keeps the real entries among them', () => {
    const markdown = section([
      'sync: features.md',
      'test(lint-boundaries): pay the ESLint cold start in a hook (#912)',
      'sync: issues.md',
      'test(file-navigator): cover paste replay branches (#906)',
      'sync: issues.md',
    ]);

    expect(entries(markdown)).toEqual([
      '- test(lint-boundaries): pay the ESLint cold start in a hook (#912)',
      '- test(file-navigator): cover paste replay branches (#906)',
    ]);
    expect(markdown).not.toContain('sync:');
  });

  it('omits the Other heading entirely when sync commits were all it would have held', () => {
    const markdown = section([
      'feat: install agent configurations (#709)',
      'sync: issues.md',
      'sync: issues.md',
      'sync: issues.md',
    ]);

    expect(headings(markdown)).toEqual(['### Features']);
    expect(markdown).not.toContain('Other');
  });

  it('still omits the release bump commit, alongside sync commits in the same history', () => {
    const markdown = section([
      'feat(package): bump version to 0.12.0',
      'sync: issues.md',
      'fix: reset the inherited credential helper list before adding gh',
    ]);

    expect(entries(markdown)).toEqual(['- reset the inherited credential helper list before adding gh']);
    expect(isReleaseCommit('feat(package): bump version to 0.12.0')).toBe(true);
  });

  it('keeps a sync commit out of the breaking changes list even when its subject says BREAKING CHANGE', () => {
    const markdown = section([
      'sync: issues.md BREAKING CHANGE: the backlog moved',
      'feat(tokens)!: collapse the four token modules into one registry (#834)',
    ]);

    expect(markdown).toContain('### ⚠ Breaking Changes');
    expect(markdown).not.toContain('sync:');
    expect(entries(markdown)).toEqual([
      '- feat(tokens)!: collapse the four token modules into one registry (#834)',
      '- collapse the four token modules into one registry (#834)',
    ]);
  });

  it('writes the version heading and the categories in their printed order', () => {
    const markdown = section([
      'chore: promote plan',
      'other: a subject that names the catch-all as its type',
      'docs: document newfile and newdir commands (#1049)',
      'feat: add a git pull button to the tree header (#962)',
      'refactor: move the git cluster into src/git/ (#1040)',
      'fix: make release scripts executable',
    ]);

    expect(markdown.startsWith(`## [${VERSION}] - ${DATE}\n\n`)).toBe(true);
    expect(headings(markdown)).toEqual([
      '### Features',
      '### Bug Fixes',
      '### Documentation',
      '### Refactoring',
      '### Chores',
      '### Other',
    ]);
  });

  it('files a subject with an unrecognized type under Other, verbatim', () => {
    const markdown = section(['test(plugins): cover the import-boundary lint rules (#939)', 'apps failure']);

    expect(markdown).toContain('### Other');
    expect(entries(markdown)).toEqual([
      '- test(plugins): cover the import-boundary lint rules (#939)',
      '- apps failure',
    ]);
  });

  it('returns the version heading and nothing else for a history of only omitted commits', () => {
    const markdown = section(['sync: issues.md', 'feat(package): bump version to 0.12.0', 'sync: bugs.md']);

    expect(markdown).toBe(`## [${VERSION}] - ${DATE}\n`);
  });

  it('returns the version heading and nothing else for an empty history', () => {
    expect(section([])).toBe(`## [${VERSION}] - ${DATE}\n`);
  });
});
