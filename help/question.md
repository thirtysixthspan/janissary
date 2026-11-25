### question

Open an answer panel for a free-text question or a panel with selectable options.

**Usage**

`question ask "<question>"`

`question approve "<question>" <option> ...`

**Use cases**

- Ask someone to provide a written answer.
- Ask someone to choose from a set of options.

**Examples**

- `question ask "Should this change ship?"` opens a free-text answer panel.
- `question approve "Choose a release" stable beta` opens an option-button panel.

An agent uses these commands from a final fenced block whose info string is `janissary`: exactly one `question` command in the block opens the panel, while a bare final line is prose that ends the turn and zero or more than one command in the block draws the shared correction.
