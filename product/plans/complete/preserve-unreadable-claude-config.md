# Preserve unreadable Claude configuration during workspace trust

**Complexity: 5/10** — the change is localized to workspace provisioning and one test file, but it writes a user-level configuration and therefore needs explicit error distinctions and atomic replacement.

## Goal

Workspace provisioning must never replace an existing Claude configuration that Janissary cannot read or parse. A missing configuration may be created, while a valid configuration keeps every unrelated setting when its workspace trust entry is added.

## Approach

Give `trustWorkspace` an optional configuration path so tests can exercise the real file behavior inside a temporary project directory. Treat only `ENOENT` as an empty starting configuration. Propagate read errors, reject malformed JSON and invalid object shapes, then write the updated object to a same-directory temporary file and atomically rename it over the target.

## Implementation steps

1. Update `src/workspace/index.ts` to distinguish a missing Claude configuration from read and parse failures, validate the root and `projects` objects, and replace the file atomically.
2. Add a HOME-anchored `src/sandbox/profile.ts` write clause limited to Janissary's `.claude.json.<uuid>.tmp` filenames so atomic replacement works from a confined workspace without widening writes to other home-directory siblings.
3. Add focused `src/workspace/index.test.ts` coverage for missing, valid, malformed, and structurally invalid configurations without accessing the real home directory, and pin the narrow sandbox profile clause in `src/sandbox/index.test.ts`.
4. Update `product/specs/workspaced-agent.md` with the trust-file preservation and provisioning-failure behavior.

## Tests

- Create a missing configuration with the requested trust entry.
- Preserve unrelated fields and existing project settings in a valid configuration.
- Reject malformed JSON without changing its bytes.
- Reject invalid root and `projects` shapes without replacing the file.
- Allow only the UUID-shaped temporary sibling needed for atomic Claude configuration replacement in the sandbox profile.
- Run `./scripts/run.mjs check-diff` after every code, test, spec, and backlog change.

## Out of scope

- Changing Claude's trust schema or trust-dialog behavior.
- Repairing malformed user configuration automatically.
- Changing workspace clone, credential-helper, removal, or remote-provisioning behavior beyond surfacing the trust-write failure.
- Changing `untrustWorkspace`, whose current best-effort cleanup does not overwrite unreadable data.
