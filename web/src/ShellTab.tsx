import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import type { JanusClient } from './ws';
import { useXterm } from './useXterm';
import { AgentTabMeta } from './AgentTabMeta';

type Properties = { ptyId: string; client: JanusClient; cwd?: string; flags?: string[] };
export type ShellTabHandle = { focus(): void };

// Only Shift+←/→ (tab switch) bubbles to the window; everything else — including Ctrl+C,
// Ctrl+D, Ctrl+Z — goes to the PTY so interactive programs receive it.
function shellKeyFilter(e: KeyboardEvent): boolean {
  if (e.type !== 'keydown') return true;
  const isTabSwitch = e.shiftKey && !e.ctrlKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight');
  return !isTabSwitch;
}

// Full-tab terminal that takes over the agent tab body while an interactive program is running.
// Unmounts when the program exits; the transcript is restored by the parent.
export const ShellTab = forwardRef<ShellTabHandle, Properties>(function ShellTab({ ptyId, client, cwd, flags }, ref) {
  const hostReference = useRef<HTMLDivElement>(null);
  const focusTerm = useXterm({
    ptyId,
    client,
    containerRef: hostReference,
    keyFilter: shellKeyFilter,
    onMount: (term) => { term.focus(); },
  });
  useImperativeHandle(ref, () => ({ focus: focusTerm }), [focusTerm]);
  return (
    <div className="harness-tab">
      <AgentTabMeta cwd={cwd} flags={flags} />
      <div className="harness-body" ref={hostReference} />
    </div>
  );
});
