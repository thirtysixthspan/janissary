### edit

Open a file in the editor, optionally at a line. If no exact file exists, a bare existing project runscript name opens that runscript instead.

**Usage**

`edit <file>[:line]`

**Use cases**

- Read or change a project file.
- Open a runscript for editing by its name.

**Examples**

- `edit src/main.ts` opens a file in the editor.
- `edit $root/src/main.ts` opens a file by its project-root path. A path can also start with `~` for your home directory, as in `edit ~/notes.txt`.
- `edit src/main.ts:42` opens the file at line 42. If the file is already open, its tab takes focus and the cursor moves to the start of that line, every time you run it.
- `edit` with no file prints `Usage: edit <file>`.
