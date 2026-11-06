import { NATIVE_ACP_COMMANDS } from '../plugins/roles/shared.js';

export type NativeCommandTool = 'database' | 'browser' | 'question';

export function nativeCommandTool(command: string): NativeCommandTool | undefined {
  const words = command.trim().split(/\s+/u);
  const native = NATIVE_ACP_COMMANDS.find((candidate) => {
    const parts = candidate.split(' ');
    return parts.every((part, index) => words[index] === part);
  });
  if (native === undefined) return undefined;
  if (native.startsWith('db ')) return 'database';
  if (native.startsWith('browser ')) return 'browser';
  return 'question';
}

export function isNativeCommand(command: string): boolean {
  return nativeCommandTool(command) !== undefined;
}
