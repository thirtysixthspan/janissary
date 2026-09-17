# Architecture diagram

### Generating the diagram

`ai/tasks/research/generate-architecture-diagram.md` produces one self-contained HTML diagram of Janissary's own architecture. It is reached the same way every other playbook is — through the task picker (see [[task-picker]]) — and runs unattended from start to finish, making every choice itself rather than pausing to ask.

The run reads the codebase's own account of its shape before it reads any source: the numbered principles in `ai/guidelines/architecture-principles.md` and the project-structure map in `CLAUDE.md`. It then checks that account against the tree as it stands, so a principle that has drifted out of date cannot quietly produce a diagram that is out of date with it. A disagreement it finds — a file the guidance names that no longer exists, a size that has moved, a directory the map does not mention — is drawn as observed and reported at the end rather than silently resolved in favour of either source.

### What the diagram shows

The default is a component architecture diagram: the parts of the system and the connections that carry real information between them. A run may instead draw a dependency graph or a UML class diagram when its own reading concludes one of those tells the more useful story that time, and it says which it chose and why.

The diagram is deliberately sparse. It carries the dozen or so components that describe how the system is actually shaped — the server and client halves, the single socket between them, the shared wire contract both sides import, the dispatch path from controller through the command registry into the registry of per-resource managers, and the plugin host — and leaves out individual files, tests, and anything the guidance describes as a pattern that no longer exists. It is a picture of the system's shape, not an inventory of its modules.

### Output

The diagram is written to `documentation/diagrams/architecture.html` as a single file with its CSS and SVG inline, so it opens in any browser with nothing else beside it. It is generated output and is never hand-edited.

Every run overwrites that one file. The diagram is a snapshot of the architecture as read today, not a history of what it used to be, so there is one file rather than one per run and no dated variants accumulate. A run that finds the architecture unchanged since the last one writes nothing and ships nothing.

The task touches that file and nothing else. It writes no application source, no specs, no backlog entries, and no documentation prose; a run that finds it has changed anything else reverts it before continuing. It also leaves the diagram renderer itself exactly as shipped — it draws with the default editorial style and never customizes, onboards, or saves a style profile.
