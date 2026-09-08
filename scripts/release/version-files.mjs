// The files that carry the package's version number, and how a release rewrites them.
//
// package.json holds the version once. package-lock.json repeats it at its root and again in
// `packages[""]`, the entry describing the root package itself — so a release that bumps only the
// manifest tags a commit whose lockfile disagrees with it, and the next `npm install` anybody runs
// rewrites those two fields and leaves the drift in their working tree.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// In the order they are written, and the order the release commit stages them.
export const VERSION_FILES = ['package.json', 'package-lock.json'];

// Both files round-trip through JSON.parse/JSON.stringify byte-for-byte at this indentation, so
// addressing the version fields by name costs nothing in diff noise — and beats patching the text,
// which would mean picking two `"version":` lines out of the lockfile's several thousand.
export function bumpVersion(text, version) {
  const document = JSON.parse(text);
  document.version = version;
  const rootPackage = document.packages?.[''];
  if (rootPackage) rootPackage.version = version;
  return JSON.stringify(document, null, 2) + '\n';
}

// Writes `version` into every version-carrying file under `root` and returns the paths written,
// which are exactly the paths the release commit stages. Missing files are found before anything
// is written, so a release never leaves half the version bumped.
export function writeVersionFiles(root, version) {
  const targets = VERSION_FILES.map((name) => ({ name, file: path.join(root, name) }));

  for (const { name, file } of targets) {
    if (!existsSync(file)) throw new Error(`missing ${name}`);
  }

  for (const { file } of targets) {
    writeFileSync(file, bumpVersion(readFileSync(file, 'utf8'), version));
  }

  return targets.map(({ file }) => file);
}
