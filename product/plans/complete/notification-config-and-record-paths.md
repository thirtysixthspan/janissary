# Notification config and record paths

**Complexity: 6/10** — a new notifications-config module plus edits to the record writer, config loader, and decoder (~140 added lines, 3 existing production files, 13 requirements, 22 scenarios; p=6.31), with the upgrade migrations for both files driving the size.

## Goal

Stop overloading `.janissary/notifications.json` with two unrelated jobs. The durable notification record moves to `.janissary/logs/notifications.json`, and the notification configuration (the event toggles and per-type alerts) is extracted out of `.janissary/config.json` into its own `.janissary/notifications.json`. Existing settings are carried over so upgrading does not silently discard a user's choices or their record history.

## Design decisions

- **The record's new home is `.janissary/logs/notifications.json`, literally as the issue spells it.** The app already has a `.janissary/log/` directory for transcript and server logs, but this change creates the plural `logs/` directory named in the issue rather than folding the record into the existing singular one.
- **The record is a log; the config is a file in its own right.** The record keeps its append-only, newline-delimited, never-read-back, best-effort behavior and its symlink and FIFO defenses. The config gains the familiar first-launch/default/backfill lifecycle that `config.json` has today.
- **The in-memory shape stays `Config.notifications`.** `getConfig().notifications`, `shouldNotify`, and `emitNativeNotification` keep working unchanged; `loadConfig` populates the field from the new file and `updateConfig` routes notification writes to it. The extraction is about where the settings live on disk, not a rewrite of their consumers.
- **Upgrades carry both files forward.** On boot, before config loading, a legacy record still at `.janissary/notifications.json` is renamed into the new logs path when it looks like a record (a first line with `detectedAt` and `event`); a file that looks like config is left alone. Then config loading takes a legacy `notifications` key out of `config.json`, uses it as the seed for `notifications.json`, and removes it from `config.json` on the next rewrite, preserving every other hand-edited key.
- **New-file lifecycle mirrors the old config rules.** A missing `notifications.json` is created with the full defaults; invalid JSON warns on stderr and uses defaults while leaving the file untouched; each field decodes independently; missing alerts (whole map or individual types) are backfilled onto disk; a failed backfill is silent.
- **`config.json` no longer holds notification settings.** Fresh configs are written without a `notifications` key, and the key is stripped from existing files when they are rewritten. `osNotifications`, `terminalBell`, and the three cue volumes stay in `config.json`.

## What already exists (reuse, don't rebuild)

| Need | Existing piece | Location |
| --- | --- | --- |
| Append-only, best-effort record with symlink/FIFO defenses | `initNotificationRecord`, `writeRecord`, `isSafeDirectory` | `src/notifications/record.ts` |
| Record write-back test fixtures | record tests | `src/notifications/record.test.ts` |
| Config type, defaults, load/update | `Config`, `DEFAULT_CONFIG`, `loadConfig`, `updateConfig` | `src/config.ts` |
| Per-setting decoding, alert decoder and backfill | `decodeConfig`, `notifications()`, `backfillNotificationAlerts`, `backfillMaxToolTurns` | `src/config-decode.ts` |
| Atomic write preserving permissions | `atomicWriteFile` | `src/atomic-write.js` |
| Default alert table keyed by the event union | `NOTIFICATION_ALERT_DEFAULTS` | `src/notifications/alert-defaults.ts` |

## Implementation steps

1. In `src/notifications/record.ts`, point the record at `path.join(projectDir, '.janissary', 'logs', 'notifications.json')`. Create `.janissary` and then `logs` with `mkdirSync` (recursive), validate both with `isSafeDirectory`, and refuse to set a path through a symlinked state or logs directory. Add a best-effort rename of a legacy record from the old path when the new one is absent and the old file's first line parses as a notification record. Keep every existing append/clear/abandon behavior.
2. Add `src/notifications/config.ts`: own `DEFAULT_NOTIFICATION_CONFIG`, `loadNotificationConfig(projectDirectory)`, `getNotificationConfig()`, and `saveNotificationConfig(config)`. It reads/writes `.janissary/notifications.json`, seeds a missing file from a legacy `notifications` key found in `config.json` (or the defaults), decodes with the helpers in `src/config-decode.ts`, warns on invalid JSON exactly like `config.json` does, and backfills missing alerts onto disk. Keep the file under the 200-line limit by extracting helpers if needed.
3. In `src/config-decode.ts`, export the notification decoder as `decodeNotificationConfig`, keep `backfillNotificationAlerts` but make it operate on the standalone notification-config object, and drop notification handling from `decodeConfig`. Leave every other decoder and `backfillMaxToolTurns` untouched.
4. In `src/config.ts`, import the new module, keep `Config.notifications` and re-export `NotificationConfig`, set the field in `loadConfig` from `loadNotificationConfig`, write fresh `config.json` without a `notifications` key, strip that key on the backfill rewrite, and in `updateConfig` route a `notifications` partial through `saveNotificationConfig` while keeping it out of `config.json`.
5. Update `product/specs/notifications.md` and `product/specs/application-config.md` for the new record path, the new config file, the extraction from `config.json`, and the upgrade carry-over.
6. Update the user-documentation pages that describe these files: `getting-started/configuration.md`, `tab-types/notifications.md`, `command-bar/commands.md`, and `advanced-agents/agent-questions.md`. No command, flag, or key binding changes, so `help/` needs nothing.

## Tests

- `src/notifications/record.test.ts`: the record path is `.janissary/logs/notifications.json`; a logs directory is created; a legacy record at the old path is renamed into it; a config-shaped file at the old path is left alone; existing append, clear, symlink, FIFO, no-directory, and re-arm cases still pass at the new path.
- `src/notifications/config.test.ts` (new): a fresh `notifications.json` is created with all defaults; a legacy `notifications` key in `config.json` seeds it and is removed from `config.json` on the rewrite; invalid JSON warns and leaves the file untouched; valid values are honored while malformed fields fall back individually; missing alerts and individual missing event types are backfilled onto disk; a complete file is left byte-for-byte untouched; `getNotificationConfig` and `saveNotificationConfig` round-trip.
- `src/config.test.ts`: replace the assertions that read notification settings out of `config.json` with checks that fresh and rewritten `config.json` files contain no `notifications` key, and that `loadConfig` populates `getConfig().notifications` from `notifications.json`.

All tests follow the referenced files' existing helpers and temp-directory setup. `$janissary/scripts/run.mjs check-diff` must be green after each step.

## Out of scope

- No change to notification events, toggles, defaults, alert types, or delivery behavior.
- No change to `osNotifications`, `terminalBell`, cue volumes, or any other `config.json` setting.
- No runtime command or UI for editing notification config; users still edit the JSON file by hand.
- No consolidation of the existing `.janissary/log/` directory or its transcript/server log files.
- No rotation, capping, or format change to the record beyond its new path.
