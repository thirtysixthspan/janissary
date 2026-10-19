# Editor document-read generation

Complexity: 6/10

## Goal

Prevent a delayed initial editor read from replacing newer watched content or user input, and keep the save baseline aligned with the newest successful read.

## Approach

Give `useEditorFile()` one document-read generation and pass the watch-reload hook the narrow coordination surface it needs. Every initial read and mtime-triggered reload supersedes earlier reads. A result may apply only while its generation and document URL are current. When a watched reload supersedes initialization, preserve the requested initial line; otherwise keep the live cursor line. On teardown or document-reference replacement, invalidate outstanding reads. If a buffer becomes populated while initialization is pending, do not overwrite it.

## Implementation steps

1. Add shared generation ownership to `useEditorFile()` and use it to guard initial reads, including cleanup and the populated-buffer case.
2. Pass the shared read coordination to `useEditorWatchReload()` so a watched read invalidates initialization and applies only while current, preserving the initial line when it wins before the first load.
3. Add deferred-read integration tests for watched-read precedence and edits made while initialization is pending, including saved hash expectations.
4. Update the editor-tab behavior spec and remove the resolved technical-debt entry.

## Tests

- In `web/src/editor/useEditorFile.test.ts`, defer the initial read, complete a newer mtime read first, then resolve initialization. Assert the newer text remains, the buffer remains clean, and the next save uses the newer content hash.
- In the same test file, populate and edit the buffer while the initial read is deferred, then resolve it. Assert the input remains, dirty state is retained, and the next save uses the disk-read baseline hash.
- Ensure a watched reload that wins before initialization retains the requested initial line.

## Specs and documentation

- Update `product/specs/editor-tab.md` to state that a newer watched read supersedes an initial load, edits made while loading are preserved, and saves compare against the latest successful disk read.
- `help.md` and public user documentation do not describe editor read concurrency, so no documentation update is needed.

## Out of scope

- Changing file-watch detection, save-conflict behavior, or synced-file provisioning.
- Changing new-file empty-buffer behavior.
