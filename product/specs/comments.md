### Command comments

Before a submitted command is saved to history or executed, `##`-delimited comments are stripped from it by `stripComments`. A **terminated** comment (`## text ##`) is removed wherever it appears in the line, with the surrounding whitespace collapsed to a single space; an **unterminated** comment (`## text` with no closing `##`) removes everything from `##` to the end. The result is trimmed. For example, `## comment ## clear` and `clear ## comment` both reduce to `clear`. The CLI path strips in `recordHistory`; a shell tab's command bar strips before dispatching a line and before recording it in that tab's own history, so neither the command nor the picker rows carry the comment. A command stripped to empty falls through to the empty-input rule.

### Empty or whitespace input

Empty or whitespace-only input is silently discarded (no log entry, no history entry). This applies after comment stripping, so a line consisting solely of a comment is discarded.
