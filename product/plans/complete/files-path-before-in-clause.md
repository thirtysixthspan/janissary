# Support a path before the remote `in` clause

**Complexity: 4/10** — extend the existing file navigator argument parser and route the parsed target through existing local or remote handling.

## Goal

Allow the planned `files <path> in <label>` form while preserving the existing `files in <label> <path>` syntax.

## Approach

Recognize a trailing `in <label>` clause after the path and expose it as the same target label as the leading clause. Keep remote path resolution in `remoteCwd`, and reject a trailing `in` clause without a label instead of treating it as a path.

## Implementation steps

1. Extend `parseFileNavigatorArgs` to extract a trailing `in <label>` clause and report a missing trailing label.
2. Keep `openFilesCommand` within the configured complexity limit by extracting its remote open/focus branch while routing both clause orders through `remoteCwd`.
3. Add parser and command tests for trailing path syntax, the existing leading form, and a missing trailing label.
4. Update `product/specs/file-navigator-tab.md` and the file navigator user guide with the accepted syntax.

## Tests

- A relative path before `in <label>` parses into the path and target label.
- The existing leading `in <label> <path>` form keeps its behavior.
- A trailing `in` without a label is refused with a useful error and opens no tree.
- A trailing-clause remote command resolves its path against that remote workspace.

## Out of scope

Changing remote path containment, `on`/`with` clause semantics, or local path expansion.
