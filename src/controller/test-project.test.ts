import { afterEach, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { seedRecordHistory } from '../acp-records/history-test-fixture.js';
import { AcpRecordStore } from '../acp-records/store.js';
import { createControllerTestProject } from './test-project.js';

const project = createControllerTestProject();
afterEach(async () => { await project.dispose(); });

it('leaves a simulated checkout history byte-for-byte unchanged through unrelated controller lifecycles', async () => {
  const checkout = mkdtempSync(path.join(import.meta.dirname, '../../temp/controller-checkout-'));
  const files = seedRecordHistory(checkout);
  const cwd = vi.spyOn(process, 'cwd').mockReturnValue(checkout);
  try {
    const report = vi.fn();
    expect(new AcpRecordStore({ projectDir: checkout }).scan(report)).toHaveLength(3);
    expect(report).not.toHaveBeenCalled();
    for (let index = 0; index < 2; index += 1) {
      const controller = project.create();
      expect(controller.rootDir).not.toBe(checkout);
      expect(controller.managers.acpRecords.rows()).toEqual([]);
      const id = controller.managers.acpRecords.begin({
        kind: 'acp', model: 'provider/model', ownerLabel: 'fixture', ownerName: 'Fixture',
      });
      expect(new AcpRecordStore({ projectDir: controller.rootDir }).read(id)).toBeDefined();
      await project.dispose();
      for (const [file, bytes] of files) expect(readFileSync(file, 'utf8')).toBe(bytes);
    }
  } finally {
    try { await project.dispose(); } finally {
      cwd.mockRestore();
      rmSync(checkout, { recursive: true, force: true });
    }
  }
});

it('keeps scratch storage until asynchronous shutdown finishes and then removes it', async () => {
  const controller = project.create();
  const root = controller.rootDir;
  const gate = Promise.withResolvers<void>();
  const disposeAgent = controller.managers.agent.dispose.bind(controller.managers.agent);
  vi.spyOn(controller.managers.agent, 'dispose').mockImplementation(async () => {
    await gate.promise;
    await disposeAgent();
  });
  const disposing = project.dispose();
  try {
    await Promise.resolve();
    expect(existsSync(root)).toBe(true);
  } finally {
    gate.resolve();
    await disposing;
  }
  expect(existsSync(root)).toBe(false);
  await project.dispose();
});
