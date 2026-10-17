import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { projectFromEvidence, seedRunscript } from './system-schedules-fixtures.mjs';

export default async function systemScheduleManagement({ page, record, scratchDir, runCommand, tabs, dialogs }) {
  seedRunscript(scratchDir, 'management-probe', 'printf management-probe\\n\n');
  await runCommand(page, 'schedule system duplicate every 1m script management-probe');
  await runCommand(page, 'schedule system duplicate every 2m script management-probe');
  await runCommand(page, 'schedules');
  const aggregateRows = page.locator('.schedules-row:visible');
  await aggregateRows.first().waitFor({ timeout: 10_000 });
  const rendered = (await page.locator('.schedules-tab:visible').textContent()) ?? '';
  assert.ok(rendered.includes('duplicate'), 'the aggregate plugin renders project-owned rows');
  assert.ok(rendered.includes('management-probe'), 'aggregate rows retain their runscript command');

  const currentTabs = await tabs(page);
  const janus = currentTabs.find((tab) => tab.name === 'janus');
  assert.ok(janus, 'the required janus tab remains open');
  await page.locator('.tab').nth(janus.index).click();
  await runCommand(page, 'schedule');
  const openDialogs = await dialogs(page);
  assert.ok(openDialogs.some((dialog) => dialog.text.includes('New schedule')), 'bare schedule opens the real dialog');
  await page.keyboard.press('Escape');
  await runCommand(page, 'schedule system cancel duplicate');
  await runCommand(page, 'schedule system list');
  const project = projectFromEvidence(scratchDir);
  const snapshot = JSON.parse(readFileSync(path.join(project, '.janissary', 'system-schedules.json'), 'utf8'));
  assert.ok(snapshot.entries.every((entry) => entry.id !== 'duplicate'), 'cancel by name removes every matching system row');
  record.management = { aggregateRowsVisible: true, dialogOpened: true, duplicateNameCancelClearedOwner: true };
  record.tabs = await tabs(page);
}
