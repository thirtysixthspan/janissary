import React from 'react';
import type { TabView, BufferLine } from '@shared/protocol';
import type { JanusClient } from '../ws';
import { Transcript } from '../shared/transcript/Transcript';
import { StatusPanels } from '../StatusPanels';
import { CommandArea } from './command-input/CommandArea';
import type { CommandInputDropHandle } from '../drop-handles';
import { AgentTabMeta } from '../shared/AgentTabMeta';
import type { useViewSearchState } from '../useViewSearchState';
import { useStatusWindows } from '../useStatusWindows';
import { statusButton } from '../status-button';
import { tabBodyBorder } from '../tab-body-border';
import { agentTabIntents } from './agent-tab-intents';

type Properties = {
  current: TabView;
  client: JanusClient;
  lines: BufferLine[];
  runCommand: (text: string) => void;
  transcriptReference: React.RefObject<HTMLDivElement | null>;
  highlight: ReturnType<typeof useViewSearchState>['highlight'];
  inputReference: React.RefObject<HTMLTextAreaElement | null>;
  pickerOverlays: React.ReactNode;
  blockingOverlayOpen: boolean;
  queueOpen: boolean;
  search: ReturnType<typeof useViewSearchState>['search'];
  globalHistory: string[];
  onCommandBarSubmit: React.ComponentProps<typeof CommandArea>['onSubmit'];
  quitConfirmOpen: boolean;
  unsavedQuitOpen: boolean;
  recallReference: React.RefObject<((text: string) => void) | null>;
  onEditQueued: React.ComponentProps<typeof CommandArea>['onEditQueued'];
  onDeleteQueued: React.ComponentProps<typeof CommandArea>['onDeleteQueued'];
  dropRef: React.RefObject<CommandInputDropHandle | null>;
  onSplit?: () => void;
};

// The normal agent-tab body: transcript, status panels, picker overlays, and the command bar.
// Split out of App.tsx to keep it under the file-size limit.
export function AgentTabBody({
  current, client, lines, runCommand, transcriptReference, highlight, inputReference,
  pickerOverlays, blockingOverlayOpen, queueOpen,
  search, globalHistory, onCommandBarSubmit, quitConfirmOpen, unsavedQuitOpen,
  recallReference, onEditQueued, onDeleteQueued, dropRef, onSplit,
}: Properties) {
  const statusWindows = useStatusWindows(current.label, current.connections.length > 0, current.schedule.length > 0);
  const intents = agentTabIntents(client, current.label);
  return (
    <div
      className="tab-body"
      style={{ borderLeft: tabBodyBorder(current.dotColor, true) }}
      onMouseUp={() => {
        const selection = globalThis.getSelection()?.toString();
        if (selection) { navigator.clipboard.writeText(selection); return; }
        inputReference.current?.focus();
      }}
    >
      <AgentTabMeta
        cwd={current.cwd}
        flags={current.flags}
        remote={current.remote}
        onOpenFileNavigator={intents.onOpenFileNavigator}
        onLaunchAgentHere={current.cwd === undefined ? undefined : intents.onLaunchAgentHere}
        onOpenTranscript={intents.onOpenTranscript}
        connectionsButton={statusButton(current.connections.length > 0, statusWindows.connections)}
        scheduleButton={statusButton(current.schedule.length > 0, statusWindows.schedule)}
        onSplit={onSplit}
      />
      <div className="main">
        <Transcript
          lines={lines}
          client={client}
          onToggleCollapse={intents.onToggleCollapse}
          onPromptClick={(text) => runCommand(text)}
          scrollRef={transcriptReference}
          highlight={highlight}
        />
        <StatusPanels
          tab={current}
          connections={statusWindows.connections}
          schedule={statusWindows.schedule}
          interactive
          onOpenAcpTranscript={intents.onOpenAcpTranscript}
        />
        {pickerOverlays}
      </div>
      <CommandArea
        search={search}
        lines={lines}
        dotColor={current.dotColor}
        history={current.cmdHistory}
        ghostHistory={globalHistory}
        onSubmit={onCommandBarSubmit}
        inputRef={inputReference}
        complete={(text, cursor) => client.request({ method: 'complete', params: { text, cursor } })}
        pickerOpen={blockingOverlayOpen || quitConfirmOpen || unsavedQuitOpen}
        busy={current.busy}
        queueOpen={queueOpen}
        recallRef={recallReference}
        onEditQueued={onEditQueued}
        onDeleteQueued={onDeleteQueued}
        dropRef={dropRef}
      />
    </div>
  );
}
