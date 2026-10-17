import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { projectFromEvidence, seedRunscript } from './system-schedules-fixtures.mjs';

export default async function systemScheduleManagement({ page, record, scratchDir, runCommand, tabs, dialogs }) {
  const project = projectFromEvidence(scratchDir);
  const store = path.join(project, '.janissary', 'system-schedules.json');
  const runscript = path.join(project, '.janissary', 'scripts', 'management-probe.rs');
  const marker = path.join(scratchDir, 'management-cleared');
  if (existsSync(marker)) {
    await runCommand(page, 'schedule system list');
    await runCommand(page, 'schedules');
    const aggregate = page.locator('.schedules-tab:visible');
    await aggregate.getByText('No scheduled commands.', { exact: true }).waitFor({ timeout: 10_000 });
    const persisted = JSON.parse(readFileSync(store, 'utf8'));
    assert.equal(persisted.entries.length, 0, 'aggregate clear-all remains persisted after ordinary restart');
    assert.ok(existsSync(runscript), 'the cleared schedule runscript survives ordinary restart');
    record.management = { phase: 'verified-after-restart', aggregateEmpty: true, systemStoreEmpty: true, runscriptPreserved: true };
    record.tabs = await tabs(page);
    return;
  }

  seedRunscript(scratchDir, 'management-probe', 'printf management-probe\\n\n');
  await runCommand(page, 'schedule system duplicate every 1m script management-probe');
  await runCommand(page, 'schedule system duplicate every 2m script management-probe');
  await runCommand(page, 'schedule tab-owned every 1h true');
  await runCommand(page, 'schedules');
  const aggregateRows = page.locator('.schedules-row:visible');
  await aggregateRows.first().waitFor({ timeout: 10_000 });
  const aggregate = page.locator('.schedules-tab:visible');
  const rendered = (await aggregate.textContent()) ?? '';
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
  const refreshedTabs = await tabs(page);
  const schedules = refreshedTabs.find((tab) => tab.name === 'schedules');
  assert.ok(schedules, 'the aggregate schedules tab remains open');
  await page.locator('.tab').nth(schedules.index).click();
  const before = JSON.parse(readFileSync(store, 'utf8'));
  const duplicates = before.entries.filter((entry) => entry.id === 'duplicate');
  assert.equal(duplicates.length, 2, 'both duplicate system schedules are persisted');
  const targetRow = aggregateRows.filter({ has: page.locator('.schedules-id', { hasText: /^duplicate$/ }) }).first();
  const selectedSpec = await targetRow.locator('.schedules-spec').textContent();
  const selected = duplicates.filter((entry) => entry.spec === selectedSpec);
  assert.equal(selected.length, 1, 'the rendered schedule specification identifies one persisted duplicate');
  const unselected = duplicates.filter((entry) => entry.key !== selected[0].key);
  assert.equal(unselected.length, 1, 'the other persisted duplicate is the unselected schedule');
  await targetRow.click();
  await page.keyboard.press('Delete');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await aggregateRows.nth(1).waitFor({ timeout: 10_000 });
  await aggregateRows.nth(2).waitFor({ state: 'detached', timeout: 10_000 });
  const afterDelete = JSON.parse(readFileSync(store, 'utf8'));
  const remaining = afterDelete.entries.filter((entry) => entry.id === 'duplicate');
  assert.equal(remaining.length, 1, 'the aggregate row action deletes exactly one duplicate');
  assert.deepEqual(remaining.map((entry) => entry.key), [unselected[0].key], 'the unselected duplicate keeps its original persisted key');
  assert.equal(await aggregateRows.filter({ has: page.locator('.schedules-id', { hasText: /^duplicate$/ }) }).count(), 1, 'the remaining duplicate is still rendered');
  assert.equal(await aggregateRows.filter({ has: page.locator('.schedules-id', { hasText: /^tab-owned$/ }) }).count(), 1, 'the tab-owned schedule remains rendered after keyed deletion');

  await page.locator('.tab').nth(janus.index).click();
  await runCommand(page, 'schedule system clear');
  await runCommand(page, 'schedule clear');
  await aggregateRows.first().waitFor({ state: 'detached', timeout: 10_000 });
  const cleared = JSON.parse(readFileSync(store, 'utf8'));
  assert.equal(cleared.entries.length, 0, 'aggregate clear-all empties persisted system schedules');
  assert.ok(existsSync(runscript), 'clear-all preserves the runscript');
  await page.locator('.tab').nth(janus.index).click();
  await runCommand(page, 'schedule list');
  const tabScheduleList = await page.locator('.tab-body[data-tab-label="janus"]:visible').textContent();
  assert.ok(tabScheduleList?.includes('No scheduled commands.'), 'aggregate clear-all empties the tab-owned schedule');
  writeFileSync(marker, 'aggregate schedules cleared before ordinary restart\n');
  record.management = { phase: 'cleared-before-restart', aggregateRowsVisible: true, dialogOpened: true, keyedDuplicateDelete: true, clearAllBothOwners: true, runscriptPreserved: true };
  record.tabs = await tabs(page);
}
