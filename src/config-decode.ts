import type { Config, NotificationConfig } from './config.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function strings(value: unknown, fallback: readonly string[]): string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
    ? [...value]
    : [...fallback];
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

function volumeValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
}

// For a setting that is a count rather than a threshold: `numberValue` would happily pass `0`, a
// negative, and a fraction through, and each of those is nonsense for "how many entries to keep".
// A well-typed but meaningless number is this decoder's job, not the consumer's.
function positiveIntegerValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function stringMap(value: unknown, fallback: Readonly<Record<string, string>>): Record<string, string> {
  if (!isRecord(value) || Object.values(value).some((entry) => typeof entry !== 'string')) {
    return { ...fallback };
  }
  return value as Record<string, string>;
}

// Keeps every entry whose value is an object and drops the rest, so one malformed plugin entry costs
// that plugin its remembered settings without discarding anyone else's.
function settingsMap(value: unknown): Record<string, Record<string, unknown>> {
  if (!isRecord(value)) return {};
  const entries = Object.entries(value)
    .filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]));
  return Object.fromEntries(entries);
}

function notifications(value: unknown, fallback: NotificationConfig): NotificationConfig {
  const record = isRecord(value) ? value : {};
  const events = isRecord(record.events) ? record.events : {};
  return {
    events: {
      stateChange: booleanValue(events.stateChange, fallback.events.stateChange),
      incomingMessage: booleanValue(events.incomingMessage, fallback.events.incomingMessage),
      scheduleFire: booleanValue(events.scheduleFire, fallback.events.scheduleFire),
      agentStart: booleanValue(events.agentStart, fallback.events.agentStart),
      rateLimited: booleanValue(events.rateLimited, fallback.events.rateLimited),
    },
  };
}

export function decodeConfig(value: unknown, defaults: Config): Config {
  const record = isRecord(value) ? value : {};
  const defaultNotifications = defaults.notifications;
  return {
    transcriptMaxLines: numberValue(record.transcriptMaxLines, defaults.transcriptMaxLines),
    tabNameMaxLength: numberValue(record.tabNameMaxLength, defaults.tabNameMaxLength),
    activeTabNameMaxLength: numberValue(record.activeTabNameMaxLength, defaults.activeTabNameMaxLength),
    clipboardHistoryMaxEntries: positiveIntegerValue(record.clipboardHistoryMaxEntries, defaults.clipboardHistoryMaxEntries),
    sandboxWorkspaces: booleanValue(record.sandboxWorkspaces, defaults.sandboxWorkspaces),
    recordShellTabs: booleanValue(record.recordShellTabs, defaults.recordShellTabs),
    interactiveShellDetection: booleanValue(record.interactiveShellDetection, defaults.interactiveShellDetection),
    syntaxTheme: stringValue(record.syntaxTheme, defaults.syntaxTheme),
    theme: stringValue(record.theme, defaults.theme),
    notifications: defaultNotifications && notifications(record.notifications, defaultNotifications),
    osNotifications: booleanValue(record.osNotifications, defaults.osNotifications),
    terminalBell: booleanValue(record.terminalBell, defaults.terminalBell),
    terminalBellVolumeSuccess: volumeValue(record.terminalBellVolumeSuccess, defaults.terminalBellVolumeSuccess),
    terminalBellVolumeWarning: volumeValue(record.terminalBellVolumeWarning, defaults.terminalBellVolumeWarning),
    terminalBellVolumeError: volumeValue(record.terminalBellVolumeError, defaults.terminalBellVolumeError),
    terminalBellMuteSuccess: booleanValue(record.terminalBellMuteSuccess, defaults.terminalBellMuteSuccess),
    terminalBellMuteWarning: booleanValue(record.terminalBellMuteWarning, defaults.terminalBellMuteWarning),
    terminalBellMuteError: booleanValue(record.terminalBellMuteError, defaults.terminalBellMuteError),
    syncPaths: strings(record.syncPaths, defaults.syncPaths),
    externalViewers: stringMap(record.externalViewers, defaults.externalViewers),
    pluginSettings: settingsMap(record.pluginSettings),
  };
}

export function configRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}
