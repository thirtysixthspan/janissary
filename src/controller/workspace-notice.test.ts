import { it, expect, vi } from 'vitest';
import { createController } from '../controller.js';
import { notify } from '../notifications/index.js';

type Reporter = (label: string, message: string) => void;
const workspace = vi.hoisted(() => ({ report: undefined as Reporter | undefined }));

vi.mock('../workspace/manager.js', () => ({
  WorkspaceManager: class {
    constructor(_projectDir: string | undefined, report: Reporter) { workspace.report = report; }
    dispose = vi.fn();
  },
}));
vi.mock('../notifications/index.js', () => ({ notify: vi.fn() }));

it('routes workspace credential failures through the established notification service', () => {
  const controller = createController({ emitState: () => {}, sendPty: () => {}, sendPtyExit: () => {} });
  try {
    expect(workspace.report).toBeDefined();
    workspace.report?.('alpha', 'ChatGPT OAuth unavailable');
    expect(notify).toHaveBeenCalledWith(controller.managers, 'manual', 'alpha', 'ChatGPT OAuth unavailable');
  } finally {
    controller.shutdown();
  }
});
