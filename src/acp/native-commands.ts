import { NATIVE_ACP_COMMANDS } from '../plugins/roles/shared.js';

export type NativeCommandTool = 'database' | 'browser' | 'question';

export function nativeCommandName(command: string): string | undefined {
  const words = command.trim().split(/\s+/u).map((word) => word.toLowerCase());
  return NATIVE_ACP_COMMANDS.find((candidate) =>
    candidate.split(' ').every((part, index) => words[index] === part));
}

export function nativeCommandTool(command: string): NativeCommandTool | undefined {
  const native = nativeCommandName(command);
  if (native === undefined) return undefined;
  if (native.startsWith('db ')) return 'database';
  if (native.startsWith('browser ')) return 'browser';
  return 'question';
}

export function isNativeCommand(command: string): boolean {
  return nativeCommandTool(command) !== undefined;
}
