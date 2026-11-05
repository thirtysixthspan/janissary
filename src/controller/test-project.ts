import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createController, type Controller } from '../controller.js';
import type { Sinks } from './types.js';

export function createControllerTestProject() {
  const controllers = new Map<Controller, string>();
  const scratchRoot = path.join(import.meta.dirname, '../../temp');
  mkdirSync(scratchRoot, { recursive: true });

  return {
    create(sinks?: Sinks): Controller {
      const projectDir = mkdtempSync(path.join(scratchRoot, 'controller-project-'));
      try {
        const controller = createController(sinks ?? { emitState: () => {}, sendPty: () => {}, sendPtyExit: () => {} }, projectDir);
        controllers.set(controller, projectDir);
        return controller;
      } catch (error) {
        rmSync(projectDir, { recursive: true, force: true });
        throw error;
      }
    },
    async dispose(): Promise<void> {
      const failures: unknown[] = [];
      for (const [controller, projectDir] of controllers) {
        try {
          await controller.shutdown();
        } catch (error) {
          failures.push(error);
        } finally {
          rmSync(projectDir, { recursive: true, force: true });
          controllers.delete(controller);
        }
      }
      if (failures.length > 0) throw new AggregateError(failures, 'Test controller shutdown failed.');
    },
  };
}
