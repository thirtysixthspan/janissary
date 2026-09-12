import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { JanusClient } from '../ws';
import type { HarnessView, RemoteTarget } from '@shared/protocol';
import { useXterm } from '../shared/terminal/useXterm';
import { AgentTabMeta } from '../shared/AgentTabMeta';
import { agentTabIntents } from '../shared/agent-tab-intents';
import type { StatusWindowButtonProps } from '../status-button';
import type { HarnessTabHandle } from '../tab-handles';
import { registerHarnessDrop } from '../harness-drop-registry';

type Properties = {
  harness: HarnessView; client: JanusClient; taskPickerOpen?: boolean; navOpen?: boolean; cwd?: string; flags?: string[]; remote?: RemoteTarget; label: string;
  connectionsButton?: StatusWindowButtonProps; scheduleButton?: StatusWindowButtonProps;
  onSplit?: () => void;
};

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
export const HarnessTab = forwardRef<HarnessTabHandle, Properties>(function HarnessTab({
  harness, client, taskPickerOpen, navOpen, cwd, flags, remote, label, connectionsButton, scheduleButton,
  onSplit,
}, ref) {
  const hostReference = useRef<HTMLDivElement>(null);
  const focusTerm = useXterm({
    ptyId: harness.ptyId,
    client,
    containerRef: hostReference,
    keyFilter: (e) => harnessKeyFilter(e, !!taskPickerOpen, !!navOpen),
    onMount: (term) => { term.focus(); },
  });

  useImperativeHandle(ref, () => ({ focus: focusTerm }), [focusTerm]);

  // A file-navigator drag released over the terminal types its paths into the harness. Focus moves
  // here first: the drag started in the file tree, where the letters the user types next are a
  // type-to-select gesture rather than text. A tab still provisioning has no PTY to write to, so it
  // publishes nothing and the marker below is left off its body.
  const ptyId = harness.ptyId;
  useEffect(() => {
    if (!ptyId) return;
    return registerHarnessDrop(ptyId, {
      insertAtCaret: (text: string) => {
        focusTerm();
        client.send({ method: 'ptyInput', params: { id: ptyId, data: text } });
      },
    });
  }, [ptyId, client, focusTerm]);

  const intents = agentTabIntents(client, label, 'openHarnessTranscriptFor');
  const isExited = harness.status === 'exited';
  return (
    <div className="harness-tab" data-doc-shot="harness-view">
      <AgentTabMeta
        cwd={cwd}
        flags={flags}
        remote={remote}
        model={harness.model}
        effort={harness.effort}
        onOpenFileNavigator={intents.onOpenFileNavigator}
        onLaunchAgentHere={cwd === undefined ? undefined : intents.onLaunchAgentHere}
        onOpenTranscript={intents.onOpenTranscript}
        connectionsButton={connectionsButton}
        scheduleButton={scheduleButton}
        onSplit={onSplit}
      />
      {isExited && (
        <div className="harness-exited">
          exited{harness.exitCode === undefined ? '' : ` (${harness.exitCode})`}
        </div>
      )}
      {harness.provisionError !== undefined && (
        <div className="harness-exited">{harness.provisionError}</div>
      )}
      {harness.browserError !== undefined && (
        <div className="harness-browser-gone">{harness.browserError}</div>
      )}
      <div className="harness-body" data-harness-drop={ptyId || undefined} ref={hostReference} onClick={() => { /* focus handled by xterm */ }} />
    </div>
  );
});
