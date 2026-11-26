import { describe, expect, it } from 'vitest';
import { selectChecks } from './diff-checks.mjs';

const FILES = ['src/a.ts', 'web/src/b.tsx', 'help/commands.md'];
const displays = (checks) => Object.fromEntries(checks.map((check) => [check.name, check.display]));

describe('selectChecks', () => {
  it("runs today's commands without a base", () => {
    expect(displays(selectChecks(FILES))).toEqual({
      lint: '$janissary/scripts/run.mjs lint-files',
      tsc: 'npm run typecheck:diff',
      'test:server': 'npm run test:diff:server',
      'test:web': 'npm run test:diff:web',
      'test:help': 'npm run test:server -- src/commands.test.ts',
    });
  });

  it('scopes lint and both test checks to the base', () => {
    expect(displays(selectChecks(FILES, 'origin/master'))).toEqual({
      lint: '$janissary/scripts/run.mjs lint-files --base origin/master',
      tsc: 'npm run typecheck:diff',
      'test:server': 'npm run test:server -- --changed origin/master',
      'test:web': 'npm run test:client -- --changed origin/master',
      'test:help': 'npm run test:server -- src/commands.test.ts',
    });
  });

  it('hands lint-files the base as arguments', () => {
    const lint = selectChecks(['scripts/x.mjs'], 'origin/master').find((check) => check.name === 'lint');
    expect(lint.args.slice(1)).toEqual(['--base', 'origin/master']);
  });

  it('selects no checks for files no check covers', () => {
    expect(selectChecks(['product/plans/ready/x.md'], 'origin/master')).toEqual([]);
  });
});
