import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import type { JanusClient } from './ws';
import { useXterm } from './shared/terminal/useXterm';
import { SelectionOverlay } from './shared/terminal/SelectionOverlay';
import { isTabSwitchChord } from './shared/terminal/window-chords';
import { AgentTabMeta } from './shared/AgentTabMeta';
import { remoteSessionControl } from './shared/remote-session-control';
import type { ShellTabHandle } from './shared/tab/handles';
import type { RemoteTargetView } from '@shared/protocol';

type Properties = {
  ptyId: string; client: JanusClient; label: string; cwd?: string; cwdDisplay?: string; flags?: string[]; remote?: RemoteTargetView;
  active?: boolean;
  onSplit?: () => void;
};

// Only the tab-switch chords (Shift+←/→ and Cmd+Shift+[/]) bubble to the window; everything
// else — including Ctrl+C, Ctrl+D, Ctrl+Z — goes to the PTY so interactive programs receive it.
function shellKeyFilter(e: KeyboardEvent): boolean {
  if (e.type !== 'keydown') return true;
  return !isTabSwitchChord(e);
}

// Full-tab terminal that takes over the agent tab body while an interactive program is running.
// Unmounts when the program exits; the transcript is restored by the parent.
export const ShellTab = forwardRef<ShellTabHandle, Properties>(function ShellTab({
  ptyId, client, label, cwd, cwdDisplay, flags, remote, active, onSplit,
}, ref) {
  const hostReference = useRef<HTMLDivElement>(null);
  const { focus: focusTerm, selection } = useXterm({
    ptyId,
    client,
    containerRef: hostReference,
    keyFilter: shellKeyFilter,
    onMount: (term) => { term.focus(); },
    active,
  });
  useImperativeHandle(ref, () => ({ focus: focusTerm }), [focusTerm]);
  return (
    <div className="harness-tab">
      <AgentTabMeta
        cwd={cwd}
        cwdDisplay={cwdDisplay}
        flags={flags}
        remote={remote}
        onSplit={onSplit}
        remoteSession={remote === undefined ? undefined : remoteSessionControl(client, label, remote)}
      />
      <div className="harness-body" ref={hostReference}>
        <SelectionOverlay state={selection.view} screen={selection.screen} />
      </div>
    </div>
  );
});
