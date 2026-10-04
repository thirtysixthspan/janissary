import type { Dispatch, SetStateAction } from 'react';

export function recordShellCommand(
  line: string,
  handled: boolean,
  setHistory: Dispatch<SetStateAction<string[]>>,
): boolean {
  if (!handled) return false;
  setHistory((previous) => [...previous, line]);
  return true;
}
