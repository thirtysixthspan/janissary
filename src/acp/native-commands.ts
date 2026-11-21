import { NATIVE_ACP_COMMANDS } from '../plugins/roles/shared.js';
import type { ApplicationCommandNativeTool } from '../shared/application-commands.js';
import { normalizeCommandName } from '../shared/command-matching.js';

export type NativeCommandTool = ApplicationCommandNativeTool;

export function matchesNativeCommand(command: string, name: string): boolean {
  const words = normalizeCommandName(command).split(' ');
  return name.split(' ').every((part, index) => words[index] === part);
}

const FILE_LS_ALIAS = /^\s*file\s+ls(?=\s|$)/i;

export function nativeCommandName(command: string): string | undefined {
  const canonical = command.replace(FILE_LS_ALIAS, 'file list');
  return NATIVE_ACP_COMMANDS.find((candidate) => matchesNativeCommand(canonical, candidate));
}

export function nativeCommandTool(command: string): NativeCommandTool | undefined {
  const native = nativeCommandName(command);
  if (native === undefined) return undefined;
  if (native.startsWith('db ')) return 'database';
  if (native.startsWith('browser ')) return 'browser';
  if (native.startsWith('file ')) return 'file';
  if (native.startsWith('web ')) return 'web';
  if (native === 'subagent') return 'subagent';
  if (native === 'tab') return 'tab';
  if (native === 'notify') return 'notify';
  return 'question';
}

export function isNativeCommand(command: string): boolean {
  return nativeCommandTool(command) !== undefined;
}
