# Script runner

`scripts/run.mjs <name> [args...]` runs a maintenance script from `scripts/`, passing the remaining arguments through. Agents reach it as `$janissary/scripts/run.mjs`, so the scripts load from the installation but act on the working directory (see [[task-picker]]).

### Resolving a name

The runner tries `<name>.mjs`, then `<name>.sh`, then `<name>` exactly, and runs the first that exists. A `.sh` file runs under `bash`; anything else runs under `node`. The runner exits with the script's exit status. When nothing matches, it prints `run: script not found: <name>` to stderr and exits 1.

### Listing scripts

Run with no name, the runner prints `Available scripts:` and then one two-space-indented name per line, sorted alphabetically and without the `.mjs` or `.sh` extension. `runnableScriptNames` in `scripts/script-listing.mjs` decides what appears.

The listing shows only regular files ending in `.mjs` or `.sh`. It leaves out directories such as `e2e/`, Vitest suites named `*.test.mjs`, and `run.mjs` itself, because none of them can be run through the runner. Each name appears once, so a `release/` directory beside `release.mjs` gives a single `release` line, and a `.mjs` and `.sh` with the same base name give one line too.

Helper modules that other scripts import, such as `script-path.mjs`, are ordinary `.mjs` files and still appear in the listing.
