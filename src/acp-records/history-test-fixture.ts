import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ACP_RECORD_RETENTION_MS } from './model.js';
import type { AcpRecord } from './types.js';

export function seedRecordHistory(projectDir: string): Map<string, string> {
  const root = path.join(projectDir, '.janissary', 'connections');
  mkdirSync(root, { recursive: true });
  const core: AcpRecord = {
    schemaVersion: 1, id: randomUUID(), title: 'ACP',
    source: { kind: 'acp', model: 'provider/model', ownerLabel: 'sentinel', ownerName: 'Sentinel' },
    startedAt: 0, updatedAt: 1, blocks: [],
  };
  const agent: AcpRecord = {
    ...core, id: randomUUID(), title: 'Agent: task.md',
    source: { ...core.source, kind: 'agent', runId: 'sentinel-run', taskPath: '/tasks/task.md' },
  };
  const endedAt = Date.now() - ACP_RECORD_RETENTION_MS - 1000;
  const expired: AcpRecord = { ...core, id: randomUUID(), updatedAt: endedAt, endedAt, outcome: 'Closed' };
  const files = new Map<string, string>();
  for (const record of [core, agent, expired]) {
    const file = path.join(root, `${record.id}.json`);
    const bytes = `${JSON.stringify(record, null, 2)}\n`;
    writeFileSync(file, bytes);
    files.set(file, bytes);
  }
  return files;
}
