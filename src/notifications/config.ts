import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { atomicWriteFile } from '../atomic-write.js';
import { backfillNotificationAlerts, configRecord, decodeNotificationConfig } from '../config-decode.js';
import { isRecord } from '../value-guards.js';
import type { NotificationConfig } from '../config.js';
import { NOTIFICATION_ALERT_DEFAULTS } from './alert-defaults.js';

// The notification settings live in their own `.janissary/notifications.json`, not in config.json.
// The file has the same lifecycle the config used to give the `notifications` section: it is created
// with every default on first launch, decoded field by field, and backfilled with missing alerts.
export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  events: {
    stateChange: false,
    scheduleFire: false,
    agentStart: false,
    rateLimited: false,
    commandDisabled: false,
    systemScheduleFire: true,
    modelsRefresh: true,
  },
  alerts: NOTIFICATION_ALERT_DEFAULTS,
};

let storedPath: string | null = null;
let notificationConfig: NotificationConfig = DEFAULT_NOTIFICATION_CONFIG;

export function loadNotificationConfig(projectDirectory: string): NotificationConfig {
  const stateDir = path.join(projectDirectory, '.janissary');
  storedPath = path.join(stateDir, 'notifications.json');
  mkdirSync(stateDir, { recursive: true });

  if (!existsSync(storedPath)) {
    const seeded = legacyNotifications(projectDirectory);
    notificationConfig = seeded !== undefined && seeded !== null
      ? decodeNotificationConfig(seeded, DEFAULT_NOTIFICATION_CONFIG)
      : DEFAULT_NOTIFICATION_CONFIG;
    const initial = seeded === undefined ? notificationConfig
      : { ...(isRecord(seeded) && seeded), ...backfillNotificationAlerts(seeded, DEFAULT_NOTIFICATION_CONFIG) };
    try {
      atomicWriteFile(storedPath, JSON.stringify(initial, undefined, 2) + '\n');
    } catch {
      // A read-only checkout still runs with the defaults in memory.
    }
    return notificationConfig;
  }

  try {
    const raw: unknown = JSON.parse(readFileSync(storedPath, 'utf8'));
    notificationConfig = decodeNotificationConfig(raw, DEFAULT_NOTIFICATION_CONFIG);
    const backfilled = backfillNotificationAlerts(raw, DEFAULT_NOTIFICATION_CONFIG);
    if (backfilled) {
      try {
        atomicWriteFile(storedPath, JSON.stringify(backfilled, undefined, 2) + '\n');
      } catch {
        // A failed backfill is silent; the defaults still apply in memory.
      }
    }
    return notificationConfig;
  } catch {
    process.stderr.write('warning: .janissary/notifications.json is invalid JSON — using defaults (file left untouched)\n');
    notificationConfig = DEFAULT_NOTIFICATION_CONFIG;
    return notificationConfig;
  }
}

// An upgrade keeps the settings a user already made in config.json. The key is consumed here and
// stripped from config.json by loadConfig, so the settings live in one place from then on.
function legacyNotifications(projectDirectory: string): unknown {
  try {
    const configPath = path.join(projectDirectory, '.janissary', 'config.json');
    if (!existsSync(configPath)) return undefined;
    const parsed: unknown = JSON.parse(readFileSync(configPath, 'utf8'));
    return configRecord(parsed)?.notifications;
  } catch {
    return undefined;
  }
}

export function getNotificationConfig(): NotificationConfig {
  return notificationConfig;
}

export function saveNotificationConfig(config: NotificationConfig): boolean {
  if (!storedPath) return false;
  try {
    const parsed: unknown = existsSync(storedPath) ? JSON.parse(readFileSync(storedPath, 'utf8')) : {};
    const raw = configRecord(parsed) ?? {};
    atomicWriteFile(storedPath, JSON.stringify({ ...raw, ...config }, undefined, 2) + '\n');
    notificationConfig = decodeNotificationConfig(config, DEFAULT_NOTIFICATION_CONFIG);
    return true;
  } catch {
    return false;
  }
}
