# Report a mistyped janus project directory as a usage error from the launcher

**Complexity: 2/10**. One check in `bin/janus.mjs` that hands a bad directory to the server's own argument parsing, plus a launcher test. The server side already does the right thing.

## Root cause

`bin/janus.mjs` finds the project directory with its own `resolveProjectDir`, which returns `path.resolve(arg)` without looking at the path. The next statement, `mkdirSync(logDir, { recursive: true })`, creates `<project-dir>/.janissary/log` for the detached server's output, outside any `try`. The check the spec describes, `parseProjectDir` in `src/cli-args.ts`, lives in the server, which the launcher only spawns after that `mkdirSync`.

So the two bad cases fail in different ways, and neither reaches the server's usage error:

- A path naming a regular file makes `mkdirSync` throw `ENOTDIR`. Node prints a stack trace naming `node:fs` and `bin/janus.mjs` and exits 1.
- A path that does not exist is created, `.janissary/log` and all. The server then parses a directory that now exists, accepts it, and starts. The bug report says this case also crashes. In this checkout it doesn't. It starts a real server in a directory the user never meant to make and exits 0. (Observed while reproducing: `node bin/janus.mjs temp/…/missing` exited 0 and left a running instance with its lock and log in the new directory.)

## Correct behavior

`product/specs/cli.md`, Usage errors: "a `<project-dir>` path that does not exist or is not a directory are rejected before the server starts. The error message is printed to stderr followed by a pointer to `--help`, and the process exits with code 2." So both cases print `invalid project directory: <path> is not a directory` and `Try 'janus --help' for more information.`, exit 2, and create nothing.

## Reproduction

- `node bin/janus.mjs temp/fix-a-bug-repro/afile` with `afile` an empty file: uncaught `Error: ENOTDIR: not a directory, mkdir '…/afile/.janissary/log'` with a Node stack trace, exit 1.
- `node bin/janus.mjs temp/fix-a-bug-repro/missing`: exit 0, no output, and `missing/.janissary/` created with `config.json`, `lock` and `log/server.log`. The log shows a server running on a loopback port.
- New test `scripts/janus-launcher.test.mjs` › "reports a path naming a regular file as a usage error, exits 2, and writes nothing beside it" fails against the unfixed launcher with status 1. Its missing-path sibling was not run against the unfixed launcher, because that starts a server.

## Approach

Before creating the log directory, the launcher checks that the resolved project directory exists and is a directory. When it isn't, the launcher runs the server attached, exactly as it already does for `--help`, `stop` and `init`. The server's own parser rejects the path with its `CliUsageError`, and `src/main.ts` prints the message and the `--help` pointer and exits 2. The launcher exits with the server's status. Parsing is the first thing `boot()` does, so nothing is written before the rejection.

That keeps one copy of the rule and one copy of the wording, in `src/cli-args.ts`. The launcher's check only answers "can I put a log directory here". If the two ever disagreed, the server would run attached rather than the launcher crashing.

Rejected: copying the existence check and the message into the launcher. That's the duplication the bug report warns can drift.

## Implementation steps

1. `bin/janus.mjs`: a `runAttached()` helper shared with the existing foreground path, an `isDirectory` check, and the hand-off before `mkdirSync`.
2. `scripts/janus-launcher.test.mjs`: the file and missing-path cases, each asserting exit 2, the usage message with the `--help` pointer, and no state created.

## Regression test

`scripts/janus-launcher.test.mjs` › "reports a path naming a regular file as a usage error, exits 2, and writes nothing beside it" and "reports a path that does not exist as a usage error, exits 2, and does not create it".

## Verification

Run `./scripts/run.mjs check-diff`. Live: this is a CLI invocation, so the live check is running the checkout's own `bin/janus.mjs` from a scratch working directory under `./temp/fix-a-bug/` against a regular file and against a missing path, and reading stderr, the exit code, and what's on disk afterwards. Expected for both: the usage message and pointer on stderr, exit 2, nothing created.

Outcome: verified. After `npm run build`, running `bin/janus.mjs notes.txt` from the scratch working directory printed `invalid project directory: notes.txt is not a directory` and `Try 'janus --help' for more information.` and exited 2. `bin/janus.mjs no-such-project` printed the same for that path and exited 2. The working directory still held only `notes.txt`, and the scratch home was empty.

## Spec and docs

`product/specs/cli.md` already describes the correct behavior. The Startup sequence section now says the launcher runs the server attached for an unusable project directory. Neither `help.md` nor the user documentation describes this error, so neither changes.

## Out of scope

- Other launcher-side argument handling, such as `resolveProjectDir`'s own flag scan.
- `stop` and `init`, which already run attached and are validated by the server.
