import React, { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import type { JanusClient } from '../ws';
import type { HarnessView, RemoteTargetView } from '@shared/protocol';
import { useXterm } from '../shared/terminal/useXterm';
import { SelectionOverlay } from '../shared/terminal/SelectionOverlay';
import { isClipboardChord, isPickerChord, isTabSwitchChord } from '../shared/terminal/window-chords';
import { AgentTabMeta } from '../shared/AgentTabMeta';
import { agentTabIntents } from '../shared/agent-tab-intents';
import { remoteSessionControl } from '../shared/remote-session-control';
import type { StatusWindowButtonProps } from '../shared/status-windows/status-button';
import type { HarnessTabHandle } from '../shared/tab/handles';
import { useHarnessPtyDrop } from './useHarnessPtyDrop';
import { ptyActions } from '../shared/terminal/pty-actions';

type Properties = {
  harness: HarnessView; client: JanusClient; taskPickerOpen?: boolean; navOpen?: boolean; cwd?: string; cwdDisplay?: string; flags?: string[]; remote?: RemoteTargetView; label: string;
  connectionsButton?: StatusWindowButtonProps; scheduleButton?: StatusWindowButtonProps;
  active?: boolean;
  onSplit?: () => void;
};

// Returns true to send to PTY, false to bubble (switch tabs, open task/nav picker, drive whichever
// picker overlay is open over this tab).
function harnessKeyFilter(e: KeyboardEvent, taskPickerOpen: boolean, navOpen: boolean): boolean {
  if (e.type !== 'keydown') return true;
  if (taskPickerOpen || navOpen) return false;
  return !(isTabSwitchChord(e) || isPickerChord(e) || isClipboardChord(e));
}

// Full-tab harness terminal: no card chrome, no command bar — the body is the PTY. All keys reach
// the harness except the tab-switch chords (Shift+←/→, Cmd+Shift+[/]), the task-picker chord
// (Ctrl+A), the tab-navigator chord (Ctrl+G), the clipboard-history chords
// (Ctrl+Shift+V and Cmd+Shift+V), and every key while either picker overlay is open over this tab (Up/Down/Left/Right/
// Enter/Escape must reach the picker instead of the PTY), which all bubble to the window handler.
export const HarnessTab = forwardRef<HarnessTabHandle, Properties>(function HarnessTab({
  harness, client, taskPickerOpen, navOpen, cwd, cwdDisplay, flags, remote, label, connectionsButton, scheduleButton,
  active, onSplit,
}, ref) {
  const hostReference = useRef<HTMLDivElement>(null);
  const actions = useMemo(() => ptyActions(client), [client]);
  const { focus: focusTerm, selection } = useXterm({
    ptyId: harness.ptyId,
    actions,
    containerRef: hostReference,
    keyFilter: (e) => harnessKeyFilter(e, !!taskPickerOpen, !!navOpen),
    active: active !== false,
    exited: harness.status === 'exited',
    onMount: (term) => { term.focus(); },
  });

  useImperativeHandle(ref, () => ({ focus: focusTerm }), [focusTerm]);

  // A tab still provisioning has no PTY to write to, so the drop marker below is left off its body.
  const ptyId = harness.ptyId;
  useHarnessPtyDrop(ptyId, client, focusTerm);

  // Every harness and ssh tab records, so the flag is drawn from the moment the tab opens — a `-w`
  // tab still provisioning included, which is when it is drawn but not yet pressable.
  const intents = agentTabIntents(client, label, 'openHarnessTranscriptFor', harness.recording);
  const isExited = harness.status === 'exited';
  return (
    <div className="harness-tab" data-doc-shot="harness-view">
      <AgentTabMeta
        cwd={cwd}
        cwdDisplay={cwdDisplay}
        flags={flags}
        remote={remote}
        model={harness.model}
        effort={harness.effort}
        onOpenFileNavigator={intents.onOpenFileNavigator}
        onLaunchAgentHere={remote === undefined
          ? cwd === undefined ? undefined : intents.onLaunchAgentHere
          : intents.onLaunchShellHere}
        launchTitle={remote === undefined
          ? undefined
          : remote.provisioning ? 'Waiting for the workspace' : 'New shell in this workspace'}
        launchDisabled={remote?.provisioning}
        onOpenTranscript={intents.onOpenTranscript}
        hasRecorder
        onOpenRecording={intents.onOpenRecording}
        connectionsButton={connectionsButton}
        scheduleButton={scheduleButton}
        onSplit={onSplit}
        remoteSession={remote === undefined
          ? undefined
          : remoteSessionControl(client, label, remote)}
      />
      {isExited && (
        <div className="harness-exited">
          {harness.sessionTerminated ?? `exited${harness.exitCode === undefined ? '' : ` (${harness.exitCode})`}`}
        </div>
      )}
      {harness.provisionError !== undefined && (
        <div className="harness-exited">{harness.provisionError}</div>
      )}
      {harness.browserError !== undefined && (
        <div className="harness-browser-gone">{harness.browserError}</div>
      )}
      <div className="harness-body" data-harness-drop={ptyId || undefined} ref={hostReference} onClick={() => { /* focus handled by xterm */ }}>
        <SelectionOverlay state={selection.view} screen={selection.screen} />
      </div>
    </div>
  );
});
