import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { projectFromEvidence, seedRunscript } from './system-schedules-fixtures.mjs';

export default async function systemScheduleRestart({ page, record, scratchDir, runCommand }) {
  const project = projectFromEvidence(scratchDir);
  const markerFile = path.join(scratchDir, 'restart-seeded');
  const store = path.join(project, '.janissary', 'system-schedules.json');
  if (!existsSync(markerFile)) {
    seedRunscript(scratchDir, 'restart-probe', "printf 'restart-script-preserved\\n'\n");
    await runCommand(page, 'schedule system restart-check every 1m script restart-probe');
    assert.ok(existsSync(store), 'the system schedule store was created by the app');
    writeFileSync(markerFile, 'created-before-restart\n');
    record.restart = { phase: 'seeded', storeBytes: readFileSync(store, 'utf8').length };
    return;
  }

  const before = readFileSync(store, 'utf8');
  await runCommand(page, 'schedule system list');
  const listing = (await page.locator('.tab-body:visible').first().textContent()) ?? '';
  assert.ok(listing.includes('restart-check'), 'the entry survives ordinary process restart');
  assert.ok(readFileSync(store, 'utf8').includes('restart-probe'), 'the persisted snapshot remains intact');
  const runscript = path.join(project, '.janissary', 'scripts', 'restart-probe.rs');
  assert.ok(existsSync(runscript), 'the runscript survives ordinary process restart');
  await runCommand(page, 'execute restart-probe');
  await runCommand(page, 'tab focus system');
  const systemShell = page.locator('.tab-body[data-tab-label="system"]:visible').first();
  await systemShell.getByText('restart-script-preserved', { exact: true }).waitFor({ timeout: 15_000 });
  record.restart = { phase: 'verified-after-restart', persistedEntryVisible: true, storeUnchanged: before === readFileSync(store, 'utf8') };
}
