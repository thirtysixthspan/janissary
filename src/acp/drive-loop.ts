import type { AcpRunSnapshot } from './types.js';
import { toolPrimer, type AcpTool } from './tool-table.js';
import { NO_BUILTIN_TOOLS_LINE, NO_TOOLS_LINE } from './internal-tools.js';
import { MARKDOWN_INSTRUCTION } from './launch.js';
import { NATIVE_ACP_COMMANDS } from '../plugins/roles/shared.js';

const TELL_INSTRUCTION = 'The user is instructing you to carry out a task. Do it with the commands available to you, then briefly report what you did.';

export function corePrimer(snapshot: Extract<AcpRunSnapshot, { kind: 'core' }>, tools: AcpTool[]): string {
  const allowList = NATIVE_ACP_COMMANDS.filter((command) => snapshot.grants.includes(command)
    && snapshot.rows.find((row) => row.name === command)?.effectiveAgentAccess !== false);
  const toolsAvailable = tools.length > 0 && allowList.length > 0;
  return [
    toolPrimer(tools, allowList),
    toolsAvailable ? NO_BUILTIN_TOOLS_LINE : NO_TOOLS_LINE,
    snapshot.role === 'tell' ? TELL_INSTRUCTION : '',
    MARKDOWN_INSTRUCTION,
  ].filter(Boolean).join('\n\n');
}
