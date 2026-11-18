import { NATIVE_ACP_COMMANDS } from '../plugins/roles/shared.js';
import type { ApplicationCommandNativeTool } from '../shared/application-commands.js';

export type NativeCommandTool = ApplicationCommandNativeTool;

export function matchesNativeCommand(command: string, name: string): boolean {
  const words = command.trim().split(/\s+/u).map((word) => word.toLowerCase());
  return name.split(' ').every((part, index) => words[index] === part);
}

export function nativeCommandName(command: string): string | undefined {
  return NATIVE_ACP_COMMANDS.find((candidate) => matchesNativeCommand(command, candidate));
}

export function nativeCommandTool(command: string): NativeCommandTool | undefined {
  const native = nativeCommandName(command);
  if (native === undefined) return undefined;
  if (native.startsWith('db ')) return 'database';
  if (native.startsWith('browser ')) return 'browser';
  if (native.startsWith('file ')) return 'file';
  if (native.startsWith('web ')) return 'web';
  if (native === 'subagent') return 'subagent';
  return 'question';
}

export function isNativeCommand(command: string): boolean {
  return nativeCommandTool(command) !== undefined;
}
