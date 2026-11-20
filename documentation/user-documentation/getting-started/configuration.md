# Configure the app

<img class="agent-float" src="/agents/ekrem-south.png" alt="" />

Set app-wide preferences in `.janissary/config.json` in the directory you launch Janissary from. Notification toggles and per-type alerts live in a separate `.janissary/notifications.json` file (see [Notification settings](#notification-settings)); the app creates both with defaults on first launch. For example, turn off shell recordings and keep more clipboard entries:

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
| `maxToolTurns` | `20` | Stored tool-turn limit, written into your config with a default of `20` and added to older configs the next time they load. Like `clipboardHistoryMaxEntries`, it must be a whole number above zero; text, zero, negatives, and fractions reset it to `20`. |
| `tabNameMaxLength` | `16` | Display limit for inactive tab names, including the final ellipsis. Full names remain available for routing. |
| `activeTabNameMaxLength` | `50` | Display limit for the focused tab name, including the final ellipsis. |
| `clipboardHistoryMaxEntries` | `15` | Clipboard-history entries kept in the popup. It must be a whole number above zero and no larger than `9007199254740991`; anything else resets to `15`. The list never holds more than this many entries, and the oldest drop first. See [Clipboard history](/user-documentation/command-bar/clipboard). |
| `sandboxWorkspaces` | `true` | Confines workspaced shell and harness tabs to their workspace clone with the macOS sandbox. |
| `recordShellTabs` | `true` | Saves shell recordings and text transcripts. Shell recordings include characters echoed by the shell, so secrets typed on a command line can be recorded. See [Shell transcripts](/user-documentation/command-bar/shell#read-a-shell-sessions-transcript). |
| `syntaxTheme` | `"github-dark"` | Syntax highlighting for every editor and diff tab. Set it with [`syntax theme`](/user-documentation/command-bar/commands#syntax-theme). |
| `theme` | `"dark"` | Colors for the app window. Pick one of six built-in themes; individual colors can't be changed. Set it with [`theme`](/user-documentation/command-bar/commands#theme). |
| `osNotifications` | `true` | Allows each type's configured desktop banner when the browser has permission. Janissary does not request permission. |
| `terminalBell` | `true` | Allows each type's configured sound cue. Browser autoplay restrictions can block playback before you interact with the page. |
| `terminalBellVolumeSuccess` | `0.8` | Volume from `0` to `1` for success cues. |
| `terminalBellVolumeWarning` | `0.8` | Volume from `0` to `1` for warning cues. |
| `terminalBellVolumeError` | `0.8` | Volume from `0` to `1` for error cues. |
| `syncPaths` | `["product/backlog/", "product/plans/"]` | Project paths eligible for automatic GitHub syncing. See [Git-synced files](/user-documentation/tab-types/editor-git-sync). |
| `externalViewers` | `{ "video": "QuickTime Player" }` | macOS application names used by external file viewers. An empty or missing entry uses the operating system's default. Setting this map replaces the defaults. See [Opening files and pages](/user-documentation/tab-types/opening-files#opening-outside-the-app-open-external). |
| `pluginSettings` | `{}` | Preferences saved by tab plugins. Each plugin owns its entry; the search tab stores its three search toggles here, as `{ "search": { "regex": false, "matchCase": false, "wholeWord": false } }`. |

## Notification settings

The notification event toggles and per-type alerts are kept in `.janissary/notifications.json`, not in `config.json`:

| Setting | Default | What it controls |
|---|---:|---|
| `events.stateChange` | `false` | Adds background agent-finished events to the notifications feed. |
| `events.scheduleFire` | `false` | Adds tab-owned scheduled-command events to the feed. |
| `events.agentStart` | `false` | Adds background agent-start events to the feed. |
| `events.rateLimited` | `false` | Adds background model rate-limit events to the feed. |
| `events.commandDisabled` | `false` | Adds a notice when a disabled command is refused, including a blocked command-backed shortcut. It is attributed to the originating tab and suppressed while that tab is active. |
| `events.systemScheduleFire` | `true` | Adds system schedule firing, missed-run, missing-runscript, and shell-start failure notices. |
| `events.modelsRefresh` | `true` | Adds a notice when a Models refresh finishes. It bypasses focus suppression and defaults to a success banner and sound. |
| `alerts` | Per-type defaults | Chooses a desktop banner and sound (`success`, `warning`, `error`, or `none`) for each notification type. See [Notifications](/user-documentation/tab-types/notifications#desktop-banners-and-bell-sounds). |

The `osNotifications`, `terminalBell`, and cue-volume settings stay in `config.json` and act as master switches over the per-type alerts. On an upgrade, a `notifications` section left in `config.json` is moved into `notifications.json` and removed from `config.json`. An invalid `desktop` or `sound` value falls back to that type's default while the other field still applies; an alert entry that isn't an object uses that type's defaults, and an alert for an unknown type is ignored. Janissary writes missing alert types into the file on startup. If the file isn't valid JSON, it prints `warning: .janissary/notifications.json is invalid JSON — using defaults (file left untouched)` and leaves the file alone. See [Notifications](/user-documentation/tab-types/notifications) for delivery behavior.

## Editing and validation

<img class="agent-float" src="/agents/yusuf-south-west.png" alt="" />

Edit `.janissary/config.json` as JSON. A setting with the wrong type falls back to its default while valid neighboring settings still apply. Numeric limits such as `transcriptMaxLines` and tab-name lengths accept any number. `clipboardHistoryMaxEntries` must be a whole number above zero and no larger than `9007199254740991`; text, zero, negatives, fractions, and larger numbers all reset it to `15`. `maxToolTurns` follows the same rule: it must be a whole number above zero, and text, zero, negatives, and fractions reset it to `20`. Bell volumes outside `0` through `1`, or values that are not numbers, use `0.8`. Removed `terminalBellMuteSuccess`, `terminalBellMuteWarning`, and `terminalBellMuteError` keys are ignored; set a notification type's `sound` to `none` in `notifications.json` to silence its cue instead.

Janissary fills in missing defaults when it starts. It adds a missing `maxToolTurns` key with its default of `20`, and writes any missing notification toggles or alert types into `notifications.json` while leaving your other settings and existing alert entries as they are. A config file that already has `maxToolTurns`, and a notification file that already lists every type, are not rewritten. If a write fails, you see no warning and the defaults still apply for that session.

`syncPaths` must be an array of strings, and every value in `externalViewers` must be a string. If either whole value is malformed, its default is used. Invalid entries in `pluginSettings` are dropped individually; a plugin setting must be a JSON object. In the search entry, any toggle that isn't exactly `true` counts as off, so one bad value doesn't affect the other two.

If the file is not valid JSON, Janissary prints `warning: .janissary/config.json is invalid JSON — using defaults (file left untouched)`, uses defaults for that session, and leaves the file untouched so you can repair it. The same applies to `notifications.json`, with that filename in the warning. Runtime changes to `theme`, `syntaxTheme`, and plugin preferences save the config file while preserving its other settings. A theme change is applied only after the save succeeds; if saving fails, the previous theme stays active. A failed plugin preference save does not show a warning in the UI.

You can change `theme` and `syntaxTheme` with their commands. The `clipboardHistoryMaxEntries`, `sandboxWorkspaces`, `recordShellTabs`, `syncPaths`, viewer, and plugin settings are edited in `config.json` directly; notification settings are edited in `notifications.json`.
