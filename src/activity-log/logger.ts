import { mkdirSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import type { ActivityLogRecord } from './types.js';
import { getDateStr, getTimeStr } from '../datetime.js';
import type { Subscription } from '../bus.js';
import { messageBus } from '../bus.js';

let logDir = '';

export class ActivityLogger {
  static get logDir(): string {
    return logDir;
  }

  static append(entry: ActivityLogRecord): void {
    if (!logDir) return;
    const logPath = path.join(logDir, `${getDateStr()}.json`);
    appendFileSync(logPath, JSON.stringify(entry) + '\n');
  }

  private sub: Subscription;

  constructor(projectDir?: string) {
    if (projectDir) {
      logDir = path.join(projectDir, '.janissary', 'logs', 'activity');
      mkdirSync(logDir, { recursive: true });
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
