import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import type { JanusClient } from './ws';
import { useXterm } from './useXterm';
import { AgentTabMeta } from './AgentTabMeta';
import type { ShellTabHandle } from './tab-handles';
import type { RemoteTarget } from '@shared/protocol';

type Properties = {
  ptyId: string; client: JanusClient; cwd?: string; flags?: string[]; remote?: RemoteTarget;
  onSplit?: () => void;
};

// Only the tab-switch chords (Shift+←/→ and Cmd+Shift+[/]) bubble to the window; everything
// else — including Ctrl+C, Ctrl+D, Ctrl+Z — goes to the PTY so interactive programs receive it.
function shellKeyFilter(e: KeyboardEvent): boolean {
  if (e.type !== 'keydown') return true;
  const isTabSwitch = (e.shiftKey && !e.ctrlKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight'))
    || (e.metaKey && e.shiftKey && ['[', '{', ']', '}'].includes(e.key));
  return !isTabSwitch;
}

// Full-tab terminal that takes over the agent tab body while an interactive program is running.
// Unmounts when the program exits; the transcript is restored by the parent.
export const ShellTab = forwardRef<ShellTabHandle, Properties>(function ShellTab({
  ptyId, client, cwd, flags, remote, onSplit,
}, ref) {
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
      <AgentTabMeta cwd={cwd} flags={flags} remote={remote} onSplit={onSplit} />
      <div className="harness-body" ref={hostReference} />
    </div>
  );
});
