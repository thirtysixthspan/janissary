// Pick the diff-scoped checks for a set of changed files. Pure: it only builds the command list
// check-diff runs. With a base ref, lint and the test checks are scoped to the branch's changes
// since that ref as well as uncommitted work.

import { hasHelpMarkdownChanges } from './help-doc-changes.mjs';
import { scriptPath } from './script-path.mjs';

// Named from this file's own directory, not the working directory — see `script-path.mjs`.
const LINT_FILES = scriptPath('lint-files.mjs');

const LINTABLE = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;

function makeCheck(name, executable, args, display) {
  return { name, executable, args, display: display ?? [executable, ...args].join(' ') };
}

function lintCheck(base) {
  if (base === undefined) return makeCheck('lint', 'node', [LINT_FILES], '$janissary/scripts/run.mjs lint-files');
  return makeCheck('lint', 'node', [LINT_FILES, '--base', base], `$janissary/scripts/run.mjs lint-files --base ${base}`);
}

// The `test:diff:*` scripts end in a bare `--changed`, so a base ref goes to the plain project
// scripts instead; appending it to `test:diff:*` would hand vitest the flag twice.
function testCheck(name, diffScript, projectScript, base) {
  if (base === undefined) return makeCheck(name, 'npm', ['run', diffScript]);
  return makeCheck(name, 'npm', ['run', projectScript, '--', '--changed', base]);
}

export function selectChecks(files, base) {
  const hasLintable = files.some((f) => {
    const name = f.split('/').pop() ?? f;
    return !name.includes('.') || LINTABLE.test(f);
  });
  const touchesSrc = files.some((f) => f.startsWith('src/'));
  const touchesWeb = files.some((f) => f.startsWith('web/'));
  // The server project also carries the tests for scripts/ (see vitest.config.ts), which have no
  // TypeScript project of their own to typecheck.
  const touchesScripts = files.some((f) => f.startsWith('scripts/'));

  // `display` is the command a user would type to rerun a check by hand.
  const checks = [];
  if (hasLintable) checks.push(lintCheck(base));
  if (touchesSrc || touchesWeb) checks.push(makeCheck('tsc', 'npm', ['run', 'typecheck:diff']));
  if (touchesSrc || touchesScripts) checks.push(testCheck('test:server', 'test:diff:server', 'test:server', base));
  if (touchesWeb) checks.push(testCheck('test:web', 'test:diff:web', 'test:client', base));
  if (hasHelpMarkdownChanges(files)) {
    checks.push(makeCheck('test:help', 'npm', ['run', 'test:server', '--', 'src/commands.test.ts']));
  }
  return checks;
}
