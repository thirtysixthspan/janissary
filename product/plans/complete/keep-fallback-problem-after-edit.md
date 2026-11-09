# Keep the fallback problem visible after a commands edit

**Complexity: 1/10**

## Goal

When the project `commands.json` is unusable and the home file is in effect, a successful edit publishes a snapshot that still reports the damaged project file.

## Approach

Carry the problem text from the edit's fresh read into the snapshot the edit publishes, matching what a refresh would publish.

## Implementation steps

1. Pass `read.problem` to `createSnapshot` in the manager `edit`.
2. Note the behavior in the application-commands spec.

## Tests

- A malformed project file and a valid home file: after an edit the published and current snapshots keep the problem and name the home file as the destination.
- The existing first-write, failed-write, and unusable-file tests stay unchanged.

## Out of scope

- Repairing the damaged file or re-reading between the read and the publish.
