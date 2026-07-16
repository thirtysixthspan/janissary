# Root path

The **root path** is the directory the application was launched from — the project the session is working in. Because the same long absolute prefix appears throughout a session's paths, the transcript abbreviates it to **`$root`** so paths read short and the project they belong to is obvious at a glance.

### The `$root` shortcut

Anywhere the application displays a filesystem path in the transcript, a path inside the root is shown with the root prefix replaced by `$root`. The root directory itself is shown as `$root/`.

```
$root/                  = /Users/name/dev/janissary
$root/src/cli.ts        = /Users/name/dev/janissary/src/cli.ts
```

### The state directory folds into the root

The application keeps its own data in a hidden state directory (`.janissary`) inside the root. That state directory is part of the root for display purposes and is elided from the shortcut, so its contents read directly under `$root` rather than exposing the internal `.janissary` segment. The clearest case is a workspaced agent's clone, which physically lives under the state directory:

```
$root/workspace/emrah   = /Users/name/dev/janissary/.janissary/workspace/emrah
```

Concretely, both the root directory and the state directory inside it are addressed as `$root`, and the **longest matching prefix wins** — so a path under the state directory loses its `.janissary` segment, while a path elsewhere under the root keeps its own first segment.

### Where it applies

The shortcut is applied wherever the application itself renders a path into a tab's transcript, including:

- the working directory shown alongside each command's prompt,
- the working directory listed in a tab's connections panel, and
- the application's own status messages that name a path (for example, the location reported when a workspaced agent is created).

### Composition with the home shortcut

The transcript already abbreviates a path under the user's home directory to `~`. `$root` is the more specific of the two: a path inside the root uses `$root`, and only a path outside the root but still under home falls back to `~`. The most specific (longest) matching prefix is the one shown.

### Input expansion

`$root` is also recognized as a path prefix when typed by the user in commands that accept file paths (`open`, `edit`, `files`). The prefix is expanded to the project root directory before the path is resolved. This works alongside `~` (home directory), which is expanded the same way. Only the start of the path is expanded — `$root` or `~` appearing mid-path are left as literal text.

### Display only

`$root` is a presentation shortcut. The underlying paths are unchanged — working directories, stored state, and the paths passed to commands all remain the real absolute paths; only what the transcript shows is shortened. The shortcut is not applied to the raw output of a shell command (that text is the user's own data and is shown verbatim); it abbreviates the paths the application renders around and about that output.

### The titlebar shows the full path

The application's window titlebar reads `Janissary (<version>): <full path>`, where `<version>` is the running app's version and `<full path>` is the root directory's real absolute path — the one exception where the `$root` shortcut is not applied. The titlebar identifies which project window this is among several open at once, and which version it is running, so it names the root directory outright rather than abbreviating it.
