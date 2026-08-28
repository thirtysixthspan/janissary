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
    sandboxWorkspaces: booleanValue(record.sandboxWorkspaces, defaults.sandboxWorkspaces),
    interactiveShellDetection: booleanValue(record.interactiveShellDetection, defaults.interactiveShellDetection),
    syntaxTheme: stringValue(record.syntaxTheme, defaults.syntaxTheme),
    theme: stringValue(record.theme, defaults.theme),
    notifications: defaultNotifications && notifications(record.notifications, defaultNotifications),
    syncPaths: strings(record.syncPaths, defaults.syncPaths),
    externalViewers: stringMap(record.externalViewers, defaults.externalViewers),
  };
}

export function configRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}
