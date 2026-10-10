import { useEffect, useMemo, useRef } from 'react';
import type { LauncherCommand } from '@shared/plugins/launcher/shared';
import { launchIcon } from './launcher-icons';

function unknownIcons(commands: readonly LauncherCommand[]): string[] {
  const icons = new Set<string>();
  for (const command of commands) {
    if (!launchIcon(command.icon).known) icons.add(command.icon);
  }
  return [...icons];
}

export function useUnknownLauncherIcons(
  commands: readonly LauncherCommand[],
  active: boolean,
  report: (icon: string) => Promise<unknown>,
): void {
  const icons = useMemo(() => unknownIcons(commands), [commands]);
  const reportRef = useRef(report);
  const pending = useRef(new Set<string>());
  const reported = useRef(new Set<string>());
  const mounted = useRef(false);
  reportRef.current = report;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    for (const icon of icons) {
      if (pending.current.has(icon) || reported.current.has(icon)) continue;
      pending.current.add(icon);
      try {
        void reportRef.current(icon).then(() => {
          pending.current.delete(icon);
          if (mounted.current) reported.current.add(icon);
        }, () => {
          pending.current.delete(icon);
        });
      } catch {
        pending.current.delete(icon);
      }
    }
  }, [active, icons]);
}
