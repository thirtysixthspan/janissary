# Stop `files print` completion after its target

**Complexity: 2/10** — one completion-slot distinction, focused regression cases, and a concise spec clarification.

## Goal

After `files print <tab>` has consumed its one navigator target, Tab must leave the input unchanged and offer no filesystem candidates. Ordinary trailing-path completion for other `files` forms must continue to fall through to filesystem completion.

## Approach

Keep `none` and `trailingPath` as distinct completion slots. Handle `none` with the unchanged input and an empty match list; keep returning `null` for `trailingPath` so the existing completion chain provides filesystem matches.

## Implementation steps

1. Update `src/completion/files.ts` so the `none` slot returns the unchanged completion result while `trailingPath` still returns `null`.
2. Add regression cases in `src/completion/files.test.ts` for a completed `files print navigator ` target and an extra argument after that target. Assert each preserves its input and has no matches. Also verify that after a valid trailing root path, ordinary filesystem fallback remains available, retaining the existing print-target cases.
3. Update `product/specs/file-navigator-tab.md` to state that `files print` offers no further completion after its single tab target.

## Tests

- `files print navigator ` returns unchanged input and no matches.
- `files print navigator extra` returns unchanged input and no matches.
- After a trailing root path such as `files expand src scripts `, ordinary filesystem fallback still returns cwd entries.
- Existing print-target label completion and other `files` completion cases continue to pass.
- Diff-scoped lint, typecheck, and related tests passed after implementation.

## Out of scope

- Changing `files` command parsing, execution, or the valid path forms it accepts.
- Changing help pages or user documentation, which do not describe this completion boundary.
- Changing filesystem fallback for completion slots other than the consumed `files print` form.
