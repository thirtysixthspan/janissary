import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import type { JanusClient } from './ws';
import type { HarnessView } from '@shared/protocol';
import { useXterm } from './useXterm';
import { tabFlagDisplay } from './tab-flag-display';

type Properties = {
  harness: HarnessView; client: JanusClient; taskPickerOpen?: boolean; cwd?: string; flags?: string[];
};
export type HarnessTabHandle = { focus(): void };

// Returns true to send to PTY, false to bubble (switch tabs, open task picker, drive the task
// picker overlay while it's open over this tab).
function harnessKeyFilter(e: KeyboardEvent, taskPickerOpen: boolean): boolean {
  if (e.type !== 'keydown') return true;
  if (taskPickerOpen) return false;
  const isTabSwitch = e.shiftKey && !e.ctrlKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight');
  const isTaskPicker = e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'a';
  return !(isTabSwitch || isTaskPicker);
}

// Full-tab harness terminal: no card chrome, no command bar — the body is the PTY. All keys reach
// the harness except the tab-switch chord (Shift+←/→), the task-picker chord (Ctrl+A), and every
// key while the task picker overlay is open over this tab (Up/Down/Left/Right/Enter/Escape must
// reach the picker instead of the PTY), which all bubble to the window handler.
export const HarnessTab = forwardRef<HarnessTabHandle, Properties>(function HarnessTab({ harness, client, taskPickerOpen, cwd, flags }, ref) {
  const hostReference = useRef<HTMLDivElement>(null);
  const focusTerm = useXterm({
    ptyId: harness.ptyId,
    client,
    containerRef: hostReference,
    keyFilter: (e) => harnessKeyFilter(e, !!taskPickerOpen),
    onMount: (term) => { term.focus(); },
  });

  useImperativeHandle(ref, () => ({ focus: focusTerm }), [focusTerm]);

  const isExited = harness.status === 'exited';
  return (
    <div className="harness-tab" data-doc-shot="harness-view">
      <div className="tab-meta">
        <span className="tab-cwd">{cwd}</span>
        <span className="tab-flags">
          {(flags ?? []).map((flag) => {
            const display = tabFlagDisplay[flag];
            if (!display) return null;
            return (
              <span key={flag} className="tab-flag" role="img" aria-label={display.label} title={display.label}>
                {display.emoji}
              </span>
            );
          })}
        </span>
      </div>
      {isExited && (
        <div className="harness-exited">
          exited{harness.exitCode === undefined ? '' : ` (${harness.exitCode})`}
        </div>
      )}
      <div className="harness-body" ref={hostReference} onClick={() => { /* focus handled by xterm */ }} />
    </div>
  );
});
