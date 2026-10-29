# Configure the app

<img class="agent-float" src="/agents/ekrem-south.png" alt="" />

Set app-wide preferences in `.janissary/config.json` in the directory you launch Janissary from. The app creates this file with defaults on first launch. For example, turn off shell recordings and keep more clipboard entries:

```json
{
  "recordShellTabs": false,
  "clipboardHistoryMaxEntries": 40
}
```

Keep only the settings you want to change. Any setting you leave out uses its default. Most changes take effect the next time you launch the app; `theme`, `syntaxTheme`, and plugin preferences can also be saved while it is running.

<img class="agent-float left" src="/agents/cavus-south-east.png" alt="" />

## Settings

| Setting | Default | What it controls |
|---|---:|---|
| `transcriptMaxLines` | `25000` | Maximum transcript entries kept per tab. The activity list in an [`agent` monitor tab](/user-documentation/advanced-agents/agent-command) uses the same cap. Older entries are dropped first. |
| `tabNameMaxLength` | `16` | Display limit for inactive tab names, including the final ellipsis. Full names remain available for routing. |
| `activeTabNameMaxLength` | `50` | Display limit for the focused tab name, including the final ellipsis. |
| `clipboardHistoryMaxEntries` | `15` | Clipboard-history entries kept in the popup. It must be a whole number above zero and no larger than `9007199254740991`; anything else resets to `15`. The list never holds more than this many entries, and the oldest drop first. See [Clipboard history](/user-documentation/command-bar/clipboard). |
| `sandboxWorkspaces` | `true` | Confines workspaced shell and harness tabs to their workspace clone with the macOS sandbox. |
| `recordShellTabs` | `true` | Saves shell recordings and text transcripts. Shell recordings include characters echoed by the shell, so secrets typed on a command line can be recorded. See [Shell transcripts](/user-documentation/command-bar/shell#read-a-shell-sessions-transcript). |
| `syntaxTheme` | `"github-dark"` | Syntax highlighting for every editor and diff tab. Set it with [`syntax theme`](/user-documentation/command-bar/commands#syntax-theme). |
| `theme` | `"dark"` | Colors for the app window. Set it with [`theme`](/user-documentation/command-bar/commands#theme). |
| `notifications.events.stateChange` | `false` | Adds background agent-finished events to the notifications feed. |
| `notifications.events.scheduleFire` | `false` | Adds tab-owned scheduled-command events to the feed. |
| `notifications.events.agentStart` | `false` | Adds background agent-start events to the feed. |
| `notifications.events.rateLimited` | `false` | Adds background model rate-limit events to the feed. |
| `notifications.events.systemScheduleFire` | `true` | Adds system schedule firing, missed-run, missing-runscript, and shell-start failure notices. |
| `notifications.alerts` | Per-type defaults | Chooses a desktop banner and sound (`success`, `warning`, `error`, or `none`) for each notification type. See [Notifications](/user-documentation/tab-types/notifications#desktop-banners-and-bell-sounds). |
| `osNotifications` | `true` | Allows each type's configured desktop banner when the browser has permission. Janissary does not request permission. |
| `terminalBell` | `true` | Allows each type's configured sound cue. Browser autoplay restrictions can block playback before you interact with the page. |
| `terminalBellVolumeSuccess` | `0.8` | Volume from `0` to `1` for success cues. |
| `terminalBellVolumeWarning` | `0.8` | Volume from `0` to `1` for warning cues. |
| `terminalBellVolumeError` | `0.8` | Volume from `0` to `1` for error cues. |
| `syncPaths` | `["product/backlog/", "product/plans/"]` | Project paths eligible for automatic GitHub syncing. See [Git-synced files](/user-documentation/tab-types/editor-git-sync). |
| `externalViewers` | `{ "video": "QuickTime Player" }` | macOS application names used by external file viewers. An empty or missing entry uses the operating system's default. Setting this map replaces the defaults. See [Opening files and pages](/user-documentation/tab-types/opening-files#opening-outside-the-app-open-external). |
| `pluginSettings` | `{}` | Preferences saved by tab plugins. Each plugin owns its entry; the search tab stores its three search toggles here, as `{ "search": { "regex": false, "matchCase": false, "wholeWord": false } }`. |

The `notifications` object can also be left out. Missing or invalid ambient event toggles default to `false`; `systemScheduleFire` defaults to `true`, including in older partial configs. Set it to `false` if you don't want system schedule notices. These toggles control the listed notification events. Manual notifications and other diagnostics do not use them. See [Notifications](/user-documentation/tab-types/notifications) for delivery behavior.

## Editing and validation

<img class="agent-float" src="/agents/yusuf-south-west.png" alt="" />

Edit `.janissary/config.json` as JSON. A setting with the wrong type falls back to its default while valid neighboring settings still apply. Numeric limits such as `transcriptMaxLines` and tab-name lengths accept any number. `clipboardHistoryMaxEntries` must be a whole number above zero and no larger than `9007199254740991`; text, zero, negatives, fractions, and larger numbers all reset it to `15`. Bell volumes outside `0` through `1`, or values that are not numbers, use `0.8`. An invalid `desktop` or `sound` value in a notification alert falls back to that type's default while the other field still applies. An alert entry that isn't an object uses that type's defaults, and an alert for an unknown notification type is ignored.

Janissary fills in missing notification defaults when it starts. If `notifications` or its `alerts` is missing or isn't an object, or if `alerts` lacks some notification types, it writes the missing defaults into the file and leaves your other settings and existing alert entries as they are. A file that already lists every type is not rewritten. If the write fails, you see no warning and the defaults still apply for that session.

`syncPaths` must be an array of strings, and every value in `externalViewers` must be a string. If either whole value is malformed, its default is used. Invalid entries in `pluginSettings` are dropped individually; a plugin setting must be a JSON object. In the search entry, any toggle that isn't exactly `true` counts as off, so one bad value doesn't affect the other two.

If the file is not valid JSON, Janissary prints `warning: .janissary/config.json is invalid JSON — using defaults (file left untouched)`, uses defaults for that session, and leaves the file untouched so you can repair it. Runtime changes to `theme`, `syntaxTheme`, and plugin preferences save the file while preserving its other settings. A theme change is applied only after the save succeeds; if saving fails, the previous theme stays active. A failed plugin preference save does not show a warning in the UI.

You can change `theme` and `syntaxTheme` with their commands. The `clipboardHistoryMaxEntries`, `sandboxWorkspaces`, `recordShellTabs`, `syncPaths`, notification, viewer, and plugin settings are edited in this file directly.
