import { resolveAgentSnapshot } from '../agent/task-resolution.js';
import { commands } from '../commands/index.js';
import { errorText } from '../error-text.js';
import { janissaryRoot } from '../janissary-root.js';
import type { ClientFrame, ServerFrame } from './protocol-frames.js';

export function resolveRemoteAgentRequest(
  frame: Extract<ClientFrame, { type: 'agent-resolve' }>,
  workspaceDir: string,
  emit: (frame: ServerFrame) => void,
): void {
  try {
    const snapshot = resolveAgentSnapshot(frame.task, frame.skills, {
      workspaceDir,
      installationDir: janissaryRoot(),
    }, commands.map(({ name }) => name));
    emit({ type: 'agent-resolve-result', id: frame.id, snapshot });
  } catch (error) {
    emit({ type: 'agent-resolve-result', id: frame.id, error: errorText(error) });
  }
}
