### Application config

Application settings are stored in `.janissary/config.json`. On first launch a default config is created if the file does not exist. The config is loaded after the `.janissary/` subdirectories are initialized and before the `App` component renders.

| Setting | Type | Default | Description |
| ------- | ---- | ------- | ----------- |
| `transcriptMaxLines` | `number` | `25000` | Maximum number of `LogEntry` objects retained per tab's transcript. When exceeded, the oldest entries are dropped (the most recent N are kept). Applied in both `appendLog` and `updateCurrentTab` so all log mutation paths are capped. |

If `.janissary/config.json` exists but is not valid JSON, a warning is printed to stderr and the application falls back to defaults for that session. The corrupt file is left on disk untouched, so a user's edits are not silently discarded.

