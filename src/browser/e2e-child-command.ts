import path from 'node:path';

// How to start a second Janissary process running the same code this one is running, which is what
// the `janus e2e-browser` child is. Both layouts are live: `npm start` and `dev:server` run
// `src/main.ts` through tsx, while a built installation runs `dist/main.js` under plain node.
//
// The answer deliberately does not come from looking for `dist/main.js` on disk the way
// `bin/janus.mjs` does. That test is right at the outer boundary, where nothing is running yet, and
// wrong here: inside a source run that file is either missing or a stale build of different code,
// and launching it would quietly run the wrong Janissary. Two facts already in this process say it
// exactly — which tree this module was loaded from, and what made that tree runnable.

export type ChildRuntime = {
  // `import.meta.filename` of the calling module: `.ts` when it was loaded from `src/` through tsx,
  // `.js` when it was loaded from `dist/`. The entry is its sibling-of-parent under the same
  // extension, so it always names the tree the parent itself is running.
  moduleFile: string;
  execPath: string;
  // `process.execArgv`. Under tsx this is exactly the loader chain — a `--require` preflight and an
  // `--import` loader, both inside the installation's own `node_modules/tsx/`. tsx implements
  // `--watch` in the parent, so watch mode leaks nothing into it.
  execArgv: readonly string[];
};

export type ChildLaunch = {
  command: string;
  // The interpreter arguments through the entry path. The caller appends the subcommand's own
  // arguments after these.
  args: string[];
};

const SOURCE_EXTENSION = '.ts';

/** The `main` entry beside this module's parent directory, in the same tree it was loaded from. */
export function janissaryEntry(moduleFile: string): string {
  const extension = path.extname(moduleFile) === SOURCE_EXTENSION ? SOURCE_EXTENSION : '.js';
  return path.join(path.dirname(moduleFile), '..', `main${extension}`);
}

/**
 * Resolve the command and leading arguments for a child Janissary process.
 *
 * The loader chain is forwarded only for a source run. A built tree needs no loader, and forwarding
 * the parent's own flags there would be a behaviour change with a real failure mode: an operator's
 * `--inspect=<port>` would be inherited by a child that then cannot bind it.
 */
export function resolveChildLaunch(runtime: ChildRuntime): ChildLaunch {
  const entry = janissaryEntry(runtime.moduleFile);
  const fromSource = path.extname(entry) === SOURCE_EXTENSION;
  return { command: runtime.execPath, args: fromSource ? [...runtime.execArgv, entry] : [entry] };
}
