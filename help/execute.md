### execute

Run a project runscript immediately in the managed system shell.

**Usage**

`execute <name>`

**Use cases**

- Run a repeatable project task without opening the script first.
- Run a script from the command bar in a shell or another tab.

**Examples**

- `execute deploy` runs the project runscript named `deploy`.
- `execute test-suite` runs the project runscript named `test-suite`.

A successful run prints nothing. The script's lines join the end of the system shell's queue together, and they run as if you had typed them in the project directory. An empty script succeeds and adds nothing.

A runscript name uses lowercase letters and digits, with single hyphens between words. Anything else, including a missing name, prints `Usage: execute <name>`. A name with no script prints `No runscript named "<name>".` A script that exists but can't be read prints `Could not read runscript "<name>".`
