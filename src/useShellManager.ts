import { useState, useRef } from 'react';
import type { ChildProcess } from 'node:child_process';
import { spawnShell } from './shell.js';

export type ShellManager = {
  shellsRef: { current: Map<number, ChildProcess> };
  cwdRef: { current: Record<string, string> };
  shellActive: Record<number, boolean>;
  setShellActive: (updater: (prev: Record<number, boolean>) => Record<number, boolean>) => void;
  getShell: (tabIndex: number, label?: string) => ChildProcess | null;
};

export function useShellManager(): ShellManager {
  const shellsRef = useRef<Map<number, ChildProcess>>(new Map());
  const cwdRef = useRef<Record<string, string>>({});
  const [shellActive, setShellActive] = useState<Record<number, boolean>>({});

  const getShell = (tabIndex: number, label?: string): ChildProcess | null => {
    let shell = shellsRef.current.get(tabIndex);
    const isNew = !shell || shell.exitCode !== null || shell.signalCode !== null;
    if (isNew) {
      shell = spawnShell(tabIndex, label ? { JANUS_AGENT_NAME: label } : undefined);
      shell.on('exit', () => shellsRef.current.delete(tabIndex));
      shell.on('error', () => shellsRef.current.delete(tabIndex));
      shellsRef.current.set(tabIndex, shell);
      setShellActive((prev) => (prev[tabIndex] ? prev : { ...prev, [tabIndex]: true }));
      if (label && cwdRef.current[label]) {
        shell.stdin!.write(`cd "${cwdRef.current[label]}"\n`);
      }
    }
    return shell ?? null;
  };

  return {
    shellsRef,
    cwdRef,
    shellActive,
    setShellActive,
    getShell,
  };
}
