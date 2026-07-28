# Profile picker profiles from two directories

**Complexity: 5/10** — the change extends existing profile discovery and loading, adds source metadata to the state contract, and teaches the small picker to render and navigate section headers.

## Goal

List profiles from both the current project's `profiles/` directory and the Janissary installation's built-in `profiles/` directory. Show their origins as Project and Janissary sections, let project profiles override same-named built-ins, and ensure a selected built-in profile can launch.

## Approach

- Keep the project profile directory as the only save destination.
- Resolve profile reads project-first, then fall back to the Janissary installation's profile directory.
- Return source-tagged profile rows for the client while retaining name-only listing for the `profile list` and validation commands.
- Render non-selectable Project and Janissary section headers in the picker and skip those headers during Up/Down navigation.
- Preserve the existing `profile launch <name>` populated command because server-side project-first resolution determines the source.

## Implementation steps

1. Extend profile directory initialization, discovery, and read-path resolution to include the Janissary profile directory with project precedence. Add server tests for both sources, duplicate names, read fallback, and project-only save paths.
2. Add a source-tagged profile row to the state protocol and thread it through the web client. Add client-side profile picker navigation helpers, render section headers, and update picker and keyboard tests.
3. Update the profiles functional spec and the existing public profile documentation to describe the two sources, section labels, override behavior, and built-in fallback.
4. Promote this plan to complete and remove only the fixed backlog line.

## Tests

- `src/profiles.test.ts`: project and Janissary discovery, project precedence for duplicate names, built-in read fallback, and project save-path stability.
- `web/src/profile-picker-keys.test.ts`: section insertion, initial selection, Up/Down header skipping, selection, and close behavior.
- `web/src/ProfilePicker.test.tsx`: both headers render with the correct rows, one-source rendering omits the empty section, headers are non-clickable, and profile rows remain selectable.
- Existing state and keyboard-routing tests updated for the source-tagged profile row contract.

## Out of scope

- Adding more profile sources or making profile directories configurable.
- Changing profile names or command syntax.
- Saving into or modifying the Janissary installation's built-in profiles.
- Showing both copies of a duplicate name; the project copy remains authoritative.
