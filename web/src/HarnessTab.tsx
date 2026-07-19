import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import type { JanusClient } from './ws';
import type { HarnessView } from '@shared/protocol';
import { useXterm } from './useXterm';
import { AgentTabMeta, type StatusWindowButtonProps } from './AgentTabMeta';

type Properties = {
  harness: HarnessView; client: JanusClient; taskPickerOpen?: boolean; navOpen?: boolean; cwd?: string; flags?: string[]; label: string;
  connectionsButton?: StatusWindowButtonProps; scheduleButton?: StatusWindowButtonProps;
};
export type HarnessTabHandle = { focus(): void };

// Returns true to send to PTY, false to bubble (switch tabs, open task/nav picker, drive whichever
// picker overlay is open over this tab).
function harnessKeyFilter(e: KeyboardEvent, taskPickerOpen: boolean, navOpen: boolean): boolean {
  if (e.type !== 'keydown') return true;
  if (taskPickerOpen || navOpen) return false;
  const isTabSwitch = (e.shiftKey && !e.ctrlKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight'))
    || (e.metaKey && e.shiftKey && ['[', '{', ']', '}'].includes(e.key));
  const isTaskPicker = e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'a';
  const isTabNav = e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'g';
  return !(isTabSwitch || isTaskPicker || isTabNav);
}

// Full-tab harness terminal: no card chrome, no command bar — the body is the PTY. All keys reach
// the harness except the tab-switch chords (Shift+←/→, Cmd+Shift+[/]), the task-picker chord
// (Ctrl+A), the tab-navigator chord (Ctrl+G), and every key while either picker overlay is open
// over this tab (Up/Down/Left/Right/Enter/Escape must reach the picker instead of the PTY), which
// all bubble to the window handler.
export const HarnessTab = forwardRef<HarnessTabHandle, Properties>(function HarnessTab({ harness, client, taskPickerOpen, navOpen, cwd, flags, label, connectionsButton, scheduleButton }, ref) {
  const hostReference = useRef<HTMLDivElement>(null);
  const focusTerm = useXterm({
    ptyId: harness.ptyId,
    client,
    containerRef: hostReference,
    keyFilter: (e) => harnessKeyFilter(e, !!taskPickerOpen, !!navOpen),
    onMount: (term) => { term.focus(); },
  });

  useImperativeHandle(ref, () => ({ focus: focusTerm }), [focusTerm]);

  const isExited = harness.status === 'exited';
  return (
    <div className="harness-tab" data-doc-shot="harness-view">
      <AgentTabMeta
        cwd={cwd}
        flags={flags}
        model={harness.model}
        effort={harness.effort}
        onOpenFileNavigator={() => client.send({ method: 'openFileNavigatorFor', params: { label } })}
        onLaunchAgentHere={cwd === undefined ? undefined : () => client.send({ method: 'launchAgentFor', params: { label } })}
        connectionsButton={connectionsButton}
        scheduleButton={scheduleButton}
      />
      {isExited && (
        <div className="harness-exited">
          exited{harness.exitCode === undefined ? '' : ` (${harness.exitCode})`}
        </div>
      )}
      {harness.provisionError !== undefined && (
        <div className="harness-exited">{harness.provisionError}</div>
      )}
      <div className="harness-body" ref={hostReference} onClick={() => { /* focus handled by xterm */ }} />
    </div>
  );
});
