### Command comments

Before a submitted command is saved to history or executed, `##`-delimited comments are stripped from it by `stripComments` (`src/tab.ts`), applied in `executeRef` (`src/cli.tsx`). A **terminated** comment (`## text ##`) is removed wherever it appears in the line, with the surrounding whitespace collapsed to a single space; an **unterminated** comment (`## text` with no closing `##`) removes everything from `##` to the end. The result is trimmed. For example, `## comment ## clear` and `clear ## comment` both reduce to `clear`. A command stripped to empty falls through to the empty-input rule.

### Empty or whitespace input

Empty or whitespace-only input is silently discarded (no log entry, no history entry). This applies after comment stripping, so a line consisting solely of a comment is discarded.
