### Application config

Application settings are stored in `.janissary/config.json`. On first launch a default config is created if the file does not exist. The config is loaded after the `.janissary/` subdirectories are initialized and before the `App` component renders.

| Setting | Type | Default | Description |
| ------- | ---- | ------- | ----------- |
| `transcriptMaxLines` | `number` | `25000` | Maximum number of `LogEntry` objects retained per tab's transcript. When exceeded, the oldest entries are dropped (the most recent N are kept). Applied in both `appendLog` and `updateCurrentTab` so all log mutation paths are capped. |
| `tabNameMaxLength` | `number` | `16` | Maximum length of a tab's name. Enforced whenever a tab is created (`agent <name>`, editor tabs using the filename as the title) or renamed (`rename`, or the inline edit in the web tab strip), on both the server and the web UI. |
| `syntaxTheme` | `string` | `"github-dark"` | The active syntax-highlighting theme for editor tabs, set via `syntax theme <name>`. Applies globally across every open editor tab. |
| `theme` | `string` | `"dark"` | The active application color theme, set via `theme <name>`. Applies to the entire window chrome — see `application-themes.md`. Independent of `syntaxTheme`. |
| `notifications` | `object` | all events off | Which background events feed the notifications tab (see `notifications.md`). Shaped as `{ "events": { "stateChange": bool, "incomingMessage": bool, "scheduleFire": bool, "agentStart": bool, "rateLimited": bool } }`, each defaulting to `false` (opt-in). There is no runtime command to change these — the user edits `.janissary/config.json` directly. The `manual` event (an agent-triggered `notify`) has no toggle and always fires. |

If `.janissary/config.json` exists but is not valid JSON, a warning is printed to stderr and the application falls back to defaults for that session. The corrupt file is left on disk untouched, so a user's edits are not silently discarded.

Some settings can be changed at runtime through a command (currently `syntaxTheme`, via `syntax theme <name>`, and `theme`, via `theme <name>`). A change like this updates the running application immediately and rewrites `config.json`, preserving any other keys already in the file. If the write fails, the setting still applies for the current session but a warning explains that it will not survive a restart.

