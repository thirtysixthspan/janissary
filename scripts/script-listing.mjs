const SCRIPT_EXTENSION = /\.(mjs|sh)$/;

export function runnableScriptNames(entries) {
  const names = entries
    .filter((entry) => entry.isFile() && SCRIPT_EXTENSION.test(entry.name))
    .filter((entry) => entry.name !== 'run.mjs' && !entry.name.endsWith('.test.mjs'))
    .map((entry) => entry.name.replace(SCRIPT_EXTENSION, ''));
  return [...new Set(names)].toSorted((a, b) => a.localeCompare(b));
}
