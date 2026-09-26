// Writes the image fixtures a run needs into a directory it owns — normally the scratch work
// directory the start task created, since an image tab resolves `open` against it.
//
// Usage: ./scripts/run.mjs e2e-fixtures <directory>

import { writeFixtures } from './e2e/fixtures.mjs';

const [directory] = process.argv.slice(2);

if (!directory) {
  console.error('usage: ./scripts/run.mjs e2e-fixtures <directory>');
  process.exit(1);
}

for (const name of writeFixtures(directory)) console.log(`${directory}/${name}`);
