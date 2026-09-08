// Absolute path to a script sitting in this directory, resolved from this module's own location
// rather than from the working directory.
//
// A task prompt reaches the runner as `$janissary/scripts/run.mjs <script>`, so the working
// directory is whatever project the agent is working on and need not be a janissary checkout at
// all. A script that shells out to a sibling by a bare `scripts/<name>.mjs` finds nothing there.
// Everything the scripts *do* still happens in that working directory — git, gh, npm and the
// linters all act on the project. Only where the code is loaded from is anchored here.

import path from 'node:path';

export function scriptPath(name) {
  return path.join(import.meta.dirname, name);
}
