# Make `state` work in a shell tab, as rendered markdown

**Complexity: 4/10** — `state` reads the tab's saved state file and prints its fields as plain text. A shell tab is a plugin tab, and plugin tabs are never saved, so in a shell tab `state` only ever answered `No state file found for "shell"`. Its plain-text layout also reads badly once the shell renders command replies as markdown: a `> input` history line turns into a quote and indentation is lost.

## Goal

`state` in a shell tab shows the tab's fields the way it does in an agent tab, and its reply is markdown that renders cleanly in the shell terminal and in an agent tab's transcript.

## Approach

When a tab has no state file and is a kind of tab that is never saved — anything other than an agent tab — `state` builds the same fields from the open tab with the tab manager's existing `buildAgentState`, the snapshot an agent tab's file is written from. An agent tab, including a remote one, keeps its current answer when it has no file.

`formatState` produces markdown: each field is a bold name, a scalar value follows in inline code, and a list or nested value follows in a fenced code block holding the existing truncated layout. Fences are made longer than any backtick run in the value so a value cannot close them early. The transcript entry is flagged as markdown, so an agent tab renders it as well.

## Implementation

1. Rewrite `formatState`'s output as markdown, keeping the existing value layout and truncation inside code blocks.
2. In the `state` command, fall back to the open tab's built state for a tab that is never saved, and flag the entry as markdown.
3. Update `formatState` tests and add `state` command tests.
4. Update the application-commands spec, the shell-tab spec, and the `state` section of the commands user documentation.

## Tests

- `formatState` renders scalars as inline code, lists and nested values as fenced blocks with the existing truncation, multi-line strings as blocks, empty values as `<empty>`, and fences that outlast any backticks in a value.
- `state` in a plugin tab with no file shows the open tab's fields; an agent tab with no file still reports that no state file was found; a saved file is preferred; the entry is flagged as markdown.

## Out of scope

- Saving plugin tabs' state, which `--relaunch` does not restore.
- Changing which fields an agent tab's state holds.
