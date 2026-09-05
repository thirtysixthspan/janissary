import { describe, it, expect } from 'vitest';
import { janissaryEntry, resolveChildLaunch } from './e2e-child-command.js';

// Both layouts are driven from explicit runtimes rather than from the one the suite happens to run
// under, since only one of them can ever be that.

const TSX_LOADER = [
  '--require', '/app/node_modules/tsx/dist/preflight.cjs',
  '--import', 'file:///app/node_modules/tsx/dist/loader.mjs',
];

const SOURCE = {
  moduleFile: '/app/src/browser/e2e-server.ts', execPath: '/usr/bin/node', execArgv: TSX_LOADER,
};

const BUILT = {
  moduleFile: '/app/dist/browser/e2e-server.js', execPath: '/usr/bin/node', execArgv: [],
};

describe('janissaryEntry', () => {
  it('names the TypeScript entry for a source run', () => {
    expect(janissaryEntry('/app/src/browser/e2e-server.ts')).toBe('/app/src/main.ts');
  });

  it('names the compiled entry for a built run', () => {
    expect(janissaryEntry('/app/dist/browser/e2e-server.js')).toBe('/app/dist/main.js');
  });

  // The entry is always this module's own sibling-of-parent. A `dist/` build sitting beside a
  // source tree is never preferred over the tree actually running, stale or not.
  it('stays in the tree the module was loaded from', () => {
    expect(janissaryEntry('/app/src/browser/e2e-server.ts')).not.toContain('dist');
  });
});

describe('resolveChildLaunch from source', () => {
  it('runs the parent\'s own interpreter', () => {
    expect(resolveChildLaunch(SOURCE).command).toBe('/usr/bin/node');
  });

  it('places the loader chain before the TypeScript entry, in order', () => {
    expect(resolveChildLaunch(SOURCE).args).toEqual([...TSX_LOADER, '/app/src/main.ts']);
  });
});

describe('resolveChildLaunch from a build', () => {
  it('launches the compiled entry bare', () => {
    expect(resolveChildLaunch(BUILT)).toEqual({ command: '/usr/bin/node', args: ['/app/dist/main.js'] });
  });

  // A built tree needs no loader, and inheriting the parent's flags has a real failure mode: a
  // second process cannot bind the debugger port the first one already holds.
  it('does not inherit an operator\'s own node flags', () => {
    const launch = resolveChildLaunch({ ...BUILT, execArgv: ['--inspect=9229'] });
    expect(launch.args).toEqual(['/app/dist/main.js']);
  });
});
