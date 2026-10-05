import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { PendingShellLines } from './pending-shell-lines';

export function useTerminalCommandHistory(setSent: Dispatch<SetStateAction<string[]>>): {
  expect: (line: string) => void;
  onCommand: (command: string) => void;
} {
  const [pending] = useState(() => new PendingShellLines());
  const expect = useCallback((line: string) => { pending.expect(line); }, [pending]);
  const onCommand = useCallback((command: string) => {
    if (!pending.claim(command)) setSent((previous) => [...previous, command]);
  }, [pending, setSent]);
  return { expect, onCommand };
}
