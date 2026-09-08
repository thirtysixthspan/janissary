import path from 'node:path';

// Where the running janissary is installed, and the name every spawned process learns it under.
// Deliberately a top-level module: the root is derived from `import.meta.dirname/..`, which only
// answers correctly from a file that compiles to the top level of `dist/` (this one, and `main.ts`,
// which uses the same pattern). A module in a subdirectory — `sandbox/index.ts`, say — would resolve
// one level short, so it imports from here rather than repeating the expression.

// The Janissary install root — the directory above the running code. Its `ai/` ships with the
// package, alongside `bin/` and (once built) `dist/`.
export function janissaryRoot(): string {
  return path.join(import.meta.dirname, '..');
}

// The install's own `ai/` directory: the guidelines, personas, and executable task prompts that ship
// with janissary. A sandboxed process reads task files from here (see `sandbox/profile.ts`), which is
// why it is named separately from the root — nothing else in the installation is carved in.
export function janissaryAiDir(): string {
  return path.join(janissaryRoot(), 'ai');
}

// The environment variable carrying `janissaryRoot()` into every process janissary spawns, so the
// `execute $janissary/ai/tasks/<task>.md` command the task picker inserts resolves for the agent that
// receives it (see product/specs/task-picker.md). Lowercase on purpose, unlike `JANISSARY_NODE` and
// `JANISSARY_PLAYWRIGHT`: those are read by scripts, while this one is typed — it appears in the
// command line a human reads and edits, and a shell expands it under the exact name written there.
export const JANISSARY_HOME_ENV = 'janissary';
