### help

Show the command list, a command's detailed help page, or the key-binding reference.

**Usage**

`help`

`help commands`

`help <command>`

`help keys`

**Use cases**

- Find an available command.
- Read a command's usage, use cases, and examples.
- Look up keyboard shortcuts.

**Examples**

- `help` lists the available commands.
- `help profile` shows the profile command's detailed help.
- `help keys` lists the key bindings.
- `help /quit` shows the `quit` page.

Bare `help` lists commands only. The key bindings appear only in `help keys`. Press Tab after `help ` to complete a page name.

Page names are lowercased, extra spaces are ignored, and one leading slash is dropped. Only an exact page name works. A name with no page prints `No help for "<name>". Type "help" for available commands.`, with `<name>` in that cleaned-up form. So `help //quit` prints `No help for "/quit". Type "help" for available commands.`, and `help tab focus` reports a missing page instead of showing `tab`. `helper` is not `help` and stays an unknown command.

If the help files can't be read, `help` prints a short summary of the built-in commands instead.
