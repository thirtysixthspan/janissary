# Tab Completion Specification

Janissary provides context-aware tab completion in the command line input, triggered by pressing the `Tab` key.

## General Behavior

When the `Tab` key is pressed, the shell attempts to complete the token immediately preceding the cursor.
- If no match is found, no action is taken.
- If a single match is found, the token is replaced with the full match (appending a trailing space for files, or a `/` for directories).
- If multiple matches are found, the token is replaced with the longest common prefix of all matches, and the user is presented with the list of possible completions.

The completion logic determines the context based on the command and the argument position of the cursor within the command line.

## Contextual Completion Rules

The shell uses the following rules, in order of precedence:

### 1. Messaging (`msg`, `broadcast`)

- **Context:** The recipient argument of `msg` or `broadcast`.
- **Candidates:**
    - For `msg`: All active agent names.
    - For `broadcast`: All active agent names plus the option `all`.
- **Behavior:**
    - `broadcast` supports comma-separated lists (e.g., `ahmed,bilal`). It completes only the segment after the last comma.

### 2. Connection Management (`connection close`)

- **Context:** The target argument of `connection close`.
- **Candidates:** All currently open connection strings (e.g., `sqlite:my-db`, `shell:bash`, `acp:opencode`, `browser:w1`).

### 3. Browser Command (`browser`)

- **Context:** The `browser` command and its subcommands.
- **Candidates & Behavior:**
    - Completes browser subcommands.
    - For commands requiring a window ID (e.g., `browser use`, `browser window close`), completes against the current tab's open browser window IDs.

### 4. Filesystem Path Completion

- **Context:** Default fallback for all other positions.
- **Behavior:**
    - Completes based on the filesystem relative to the current working directory.
    - Supports tilde (`~`) expansion to the user's home directory.
    - Hides hidden files (dotfiles) unless the partial name typed explicitly starts with a dot (`.`).
    - Appends a `/` if the match is a directory, and a space if it is a file.
