### newfile

Open a new unsaved plain-text file in the editor. Save it to write it to disk; if the requested name is taken, a free name is chosen.

The editor has focus as soon as it opens, so you can type right away. No rename session starts: the name you gave stays plain text in the metadata row, which you can double-click to rename. This differs from the file navigator's New file action, which focuses the proposed name so you can replace it first.

**Usage**

`newfile <file>`

**Use cases**

- Draft a new file before saving it.
- Create a new file with a unique name in a directory.

**Examples**

- `newfile notes.md` opens a new unsaved file named `notes.md`.
- `newfile src/todo.txt` opens a new unsaved file under `src`.
