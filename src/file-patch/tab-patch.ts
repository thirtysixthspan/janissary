import type { FileSystemPort } from '../file-navigator/filesystem-port.js';
import { isPassThroughMessage } from '../file-write/outcome.js';
import { parseFilePatchCommand } from './command.js';
import { patchRejectionLine } from './messages.js';

export async function runFilePatch(port: FileSystemPort, root: string, input: string): Promise<string> {
  const result = parseFilePatchCommand(input);
  if ('error' in result) return result.error;
  try {
    return await port.applyPatch(root, result.patchText);
  } catch (error) {
    return error instanceof Error && isPassThroughMessage(error.message) ? error.message : patchRejectionLine(error);
  }
}
