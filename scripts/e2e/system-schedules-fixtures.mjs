import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const PROJECT_PREFIX = 'system-schedules-project.';

export function projectFromEvidence(evidenceDir) {
  const evidence = path.resolve(evidenceDir);
  const project = path.dirname(evidence);
  const tempRoot = path.resolve('temp');
  if (path.dirname(project) !== tempRoot
    || !path.basename(project).startsWith(PROJECT_PREFIX)
    || path.basename(evidence) !== 'evidence') {
    throw new Error('system schedule fixtures require temp/system-schedules-project.*/evidence');
  }
  return project;
}

export function seedRunscript(evidenceDir, name, contents) {
  if (!/^[a-z]+(?:-[a-z]+)*$/.test(name)) throw new Error(`invalid runscript name: ${name}`);
  const directory = path.join(projectFromEvidence(evidenceDir), '.janissary', 'scripts');
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${name}.rs`);
  writeFileSync(file, contents);
  return file;
}
