import { resolveAgentSnapshot } from '../agent/task-resolution.js';
import { commands } from '../commands/index.js';
import { errorText } from '../error-text.js';
import { janissaryRoot } from '../janissary-root.js';
import type { ClientFrame, ServerFrame } from './protocol-frames.js';
import type { RemoteRunClones } from './serve-run-clones.js';

export function resolveRemoteAgentRequest(
  frame: Extract<ClientFrame, { type: 'agent-resolve' }>,
  workspaceDir: string,
  emit: (frame: ServerFrame) => void,
  lookupWorkspace?: RemoteRunClones['lookup'],
): void {
  try {
    const selectedDir = frame.workspace === undefined
      ? workspaceDir
      : lookupWorkspace?.(frame.workspace);
    if (selectedDir === undefined) throw new Error(`Unknown remote run clone "${frame.workspace}".`);
    const snapshot = resolveAgentSnapshot(frame.task, frame.skills, {
      workspaceDir: selectedDir,
      installationDir: janissaryRoot(),
    }, commands.map(({ name }) => name));
    emit({ type: 'agent-resolve-result', id: frame.id, snapshot });
  } catch (error) {
    emit({ type: 'agent-resolve-result', id: frame.id, error: errorText(error) });
  }
}
