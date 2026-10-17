import assert from 'node:assert/strict';
import { seedRunscript } from './system-schedules-fixtures.mjs';

export default async function systemScheduleExecution({ page, record, scratchDir, runCommand, tabs }) {
  const marker = `system-schedule-execution-${Date.now()}`;
  seedRunscript(scratchDir, 'execution-probe', `printf '${marker}\\n'\npwd\nfalse\nprintf later-line\\n\n`);

  await runCommand(page, 'execute execution-probe');
  await runCommand(page, 'tab focus system');
  const shell = page.locator('.tab-body[data-tab-label="system"]:visible').first();
  await page.getByText(marker, { exact: true }).waitFor({ timeout: 15_000 });
  await shell.getByText('later-line', { exact: true }).waitFor({ timeout: 15_000 });
  const transcript = (await shell.textContent()) ?? '';
  assert.ok(transcript.includes(marker), 'the real managed shell prints the runscript marker');
  assert.ok(transcript.includes('later-line'), 'a failing command does not stop subsequent script lines');

  const currentTabs = await tabs(page);
  const janus = currentTabs.find((tab) => tab.name === 'janus');
  assert.ok(janus, 'the required janus tab remains open');
  await page.locator('.tab').nth(janus.index).click();
  await runCommand(page, 'schedule system near-term every 1m script execution-probe');
  await runCommand(page, 'schedule system list');
  const listed = (await page.locator('.tab-body:visible').first().textContent()) ?? '';
  assert.ok(listed.includes('near-term'), 'the system schedule is listed through the app command path');
  record.execution = {
    markerVisible: true,
    continuedAfterFailure: true,
    scheduledEntryVisible: true,
    tabs: await tabs(page),
  };
}
