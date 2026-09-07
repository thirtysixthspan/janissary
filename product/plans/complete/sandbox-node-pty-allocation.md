# Allow node-pty allocation inside the workspace sandbox

**Complexity: 3/10** — the profile change is two narrow device clauses, with a host-only integration test needed to demonstrate the actual macOS allocation path rather than merely inspecting profile text.

## Goal

Allow a Node process already running under Janissary's Seatbelt profile to allocate and use a pseudoterminal through `node-pty`. This lets Janissary itself run inside the same profile without losing its PTY-backed terminal features.

## Root cause

The profile permits terminal slave paths (`/dev/tty*`) and legacy PTY paths (`/dev/pty*`) for read/write and ioctl operations. macOS allocates a new PTY through the master multiplexer at `/dev/ptmx`. That path matches neither existing expression, so the top-level default deny blocks node-pty's native `forkpty` path when node-pty runs inside Seatbelt.

## Approach

Add `/dev/ptmx` as a literal to the existing narrow terminal read/write and ioctl carve-outs. Keep the existing slave-device rules unchanged. Verify the real profile by copying the installed node-pty package into a temporary workspace and launching Node through `sandboxSpawn`; the process itself, rather than Janissary's outer process, then loads node-pty and spawns `/bin/sh` in a PTY.

## Implementation

1. Update `src/sandbox/profile.ts` to allow data I/O and ioctl access to `/dev/ptmx` alongside `/dev/null`, `/dev/tty*`, and `/dev/pty*`.
2. Add `src/sandbox/pty.sandbox.test.ts`, a macOS host-only integration test that runs node-pty under the emitted profile and asserts that a PTY child produces output and exits successfully.
3. Update `product/specs/sandbox.md` to name `/dev/ptmx` as the allocation device and distinguish it from the inherited terminal slave.

## Tests

- `npm run test:sandbox -- src/sandbox/pty.sandbox.test.ts` verifies the real Seatbelt profile allows an in-profile node-pty allocation.
- `./scripts/run.mjs check-diff` verifies linting, typechecking, and affected ordinary tests. The host-only sandbox suite remains separate because Seatbelt cannot nest.

## Out of scope

- Changing how Janissary wraps workspaced commands in `sandbox-exec`.
- Broadening device access beyond the PTY master, terminal slave paths, and `/dev/null`.
