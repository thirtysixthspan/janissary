import { mkdirSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import type { ActivityLogRecord } from './types.js';
import { getDateStr, getTimeStr } from '../datetime.js';
import type { Subscription } from '../bus.js';
import { messageBus } from '../bus.js';
import { getConfig } from '../config.js';
import { errorText } from '../error-text.js';
import { reapFilesOlderThan } from '../state/reaper.js';

let logDir = '';
let abandoned = false;

const DAY_MS = 86_400_000;

export class ActivityLogger {
  static get logDir(): string {
    return logDir;
  }

  static append(entry: ActivityLogRecord): void {
    if (!logDir || abandoned || !getConfig().logEnabled) return;
    const logPath = path.join(logDir, `${getDateStr()}.json`);
    try {
      mkdirSync(logDir, { recursive: true });
      appendFileSync(logPath, JSON.stringify(entry) + '\n');
    } catch (error) {
      process.stderr.write(`activity log: write failed, not logging for the rest of this run: ${errorText(error)}\n`);
      abandoned = true;
    }
  }

  private sub: Subscription;

  constructor(projectDir?: string) {
    abandoned = false;
    if (projectDir) {
      logDir = path.join(projectDir, '.janissary', 'logs', 'activity');
    }
    this.sub = messageBus.on('transcript', 'entry:appended', (event) => {
      if (event.type !== 'entry:appended') return;
      const { tabLabel, entry } = event;
      const ts = getTimeStr();
      if (entry.input) ActivityLogger.append({ timestamp: ts, agent: tabLabel, text: entry.input });
      if (entry.output) ActivityLogger.append({ timestamp: ts, agent: tabLabel, text: entry.output });
    });
  }

  unsubscribe(): void {
    this.sub.unsubscribe();
  }
}

export async function reapActivityLogs(launchedAt: number, days: number): Promise<void> {
  if (!logDir) return;
  await reapFilesOlderThan(logDir, '.json', launchedAt - days * DAY_MS);
}
