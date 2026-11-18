import { randomUUID } from 'node:crypto';
import type { Managers } from '../managers.js';
import type { CommandInvocationContext } from '../commands/types.js';
import type { AcpDispatchReceipt } from '../acp/response.js';
import { knownRoleSettings } from '../acp/ask-role.js';
import { errorText } from '../error-text.js';
import { tabRuntime } from '../tab/runtime.js';
import { parseSubagentCommand, SUBAGENT_FLAG_USAGE, SUBAGENT_JSON_USAGE } from './parse.js';
import { launchSubagent, type SubagentLaunchOptions } from './launch.js';

export type SubagentCommandResult =
  | string
  | Extract<AcpDispatchReceipt, { kind: 'record' }>
  | undefined;

type Refusal = Readonly<{
  managers: Managers;
  label: string;
  original: string;
  invocation: CommandInvocationContext | undefined;
  acp: boolean;
}>;

function refuseSubagentCommand(refusal: Refusal, output: string): SubagentCommandResult {
  if (refusal.acp) return output;
  const tab = refusal.managers.tab.byLabel(refusal.label);
  if (!tab) return undefined;
  const runtime = tabRuntime(tab);
  if (runtime.closing) return undefined;
  const incarnation = refusal.invocation?.caller.incarnation;
  if (incarnation !== undefined && incarnation !== runtime.incarnation) return undefined;
  refusal.managers.tab.append(refusal.label, {
    input: refusal.original, output, background: randomUUID(),
  });
  return undefined;
}

export function runSubagentCommand(
  command: string,
  tab: { label: string; index: number },
  managers: Managers,
  invocation?: CommandInvocationContext,
): SubagentCommandResult {
  const acp = invocation?.acpTool === true;
  const usage = acp ? SUBAGENT_JSON_USAGE : SUBAGENT_FLAG_USAGE;
  const refusal: Refusal = {
    managers, label: tab.label, original: invocation?.line ?? command, invocation, acp,
  };
  const parsed = parseSubagentCommand(command);
  if ('error' in parsed) return refuseSubagentCommand(refusal, usage);
  if (parsed.form !== (acp ? 'json' : 'flags')) return refuseSubagentCommand(refusal, usage);

  const settings = knownRoleSettings(managers.tab.launchDir, parsed.role);
  if (!settings) return refuseSubagentCommand(refusal, `Subagent: unknown role "${parsed.role.trim()}".`);
  const enabled = settings.entries.filter((entry) => managers.models.isKnownModel(entry.harness, entry.model));
  const [first, ...rest] = enabled;
  if (!first) return refuseSubagentCommand(refusal, `Subagent: the ${settings.name} role lists no models.`);

  const options: SubagentLaunchOptions = {
    label: tab.label,
    task: parsed.task,
    ...(parsed.context !== undefined && { context: parsed.context }),
    commandText: command,
    ...(invocation && { invocation }),
    settings,
    entries: [first, ...rest],
  };
  let receipt: Extract<AcpDispatchReceipt, { kind: 'record' }>;
  try {
    receipt = launchSubagent(options, managers) as Extract<AcpDispatchReceipt, { kind: 'record' }>;
  } catch (error) {
    return refuseSubagentCommand(refusal, errorText(error));
  }
  return acp ? '' : receipt;
}
