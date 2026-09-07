import React from 'react';
import type { HarnessLaunchView, ScheduleLaunchView, TabView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { AgentTabBody } from './agent-tabs/AgentTabBody';
import { AppShell } from './AppShell';
import { AppCenterActionArea } from './AppCenterActionArea';
import { AppReportingSection } from './AppReportingSection';
import { HarnessLaunchDialog } from './harness/HarnessLaunchDialog';
import { ScheduleDialog } from './ScheduleLaunchDialog/ScheduleDialog';
import { QuitDialog } from './QuitDialog/QuitDialog';
import { UnsavedQuitDialog } from './UnsavedQuitDialog';
import { CloseSaveGuard } from './CloseSaveGuard';
import { PickerOverlays } from './pickers/PickerOverlays';
import { commandBarSuppressed } from './pickers/overlay-registry';
import type { PickerOverlayView } from './pickers/picker-overlay-view';
import { mountedPickerOverlayProps } from './pickers/picker-overlay-props';
import type { TabEntry } from './tab-entries';
import type { LayoutState } from './useLayoutState';
import type { DirtyTabHandle, HarnessTabHandle, ShellTabHandle, QuestionPanelHandle } from './tab-handles';
import type { EditorDropHandle } from './drop-handles';

type AppMainProps = Omit<
  React.ComponentProps<typeof AgentTabBody>,
  'onSplit' | 'pickerOverlays' | 'blockingOverlayOpen' | 'queueOpen'
> & LayoutState & {
  // Every overlay's state, built once by `usePickerOverlays`. `PickerOverlays` takes exactly this
  // bag, and the two overlays a mounted harness tab renders are projected out of it below.
  pickers: PickerOverlayView;
  tabs: TabView[];
  activeTab: number;
  secondaryTab?: number;
  windowFocused: boolean;
  actionEntries: TabEntry[];
  reportingEntries: TabEntry[];
  closeTab: (index: number) => void;
  tabNameMaxLength: number;
  activeTabNameMaxLength: number;
  harnessHandles: React.RefObject<Map<string, HarnessTabHandle>>;
  shellHandles: React.RefObject<Map<string, ShellTabHandle>>;
  questionPanelRef: React.RefObject<QuestionPanelHandle | null>;
  tabHandles: React.RefObject<Map<string, DirtyTabHandle>>;
  editorDropReference: React.RefObject<EditorDropHandle | null>;
  dirtyPluginTabs: ReadonlySet<string>;
  onPluginDirty: (label: string, dirty: boolean) => void;
  harnessLaunch: HarnessLaunchView | null;
  scheduleLaunch: ScheduleLaunchView | null;
  confirmQuit: () => void;
  cancelQuit: () => void;
  confirmUnsavedQuit: () => void;
  cancelUnsavedQuit: () => void;
  guardRef: React.RefObject<((index: number) => boolean) | null>;
  client: JanusClient;
};

// The root render tree: the focused agent body plus the shell/sidebars/dialogs around it.
// Split out of App.tsx to keep it under the file-size limit.
export function AppMain({
  current, client, lines, runCommand, transcriptReference, highlight, inputReference,
  pickers, tabs,
  search, globalHistory, commandDrafts, onCommandBarSubmit, quitConfirmOpen, unsavedQuitOpen,
  recallReference, onEditQueued, onDeleteQueued, dropRef,
  activeTab, secondaryTab, windowFocused, actionEntries, reportingEntries, closeTab,
  tabNameMaxLength, activeTabNameMaxLength,
  sidebarLeftWidth, setSidebarLeftWidth, sidebarRightWidth, setSidebarRightWidth,
  reportingHeightPct, setReportingHeightPct, focusLeft, focusRight,
  harnessHandles, shellHandles, questionPanelRef, tabHandles, editorDropReference,
  dirtyPluginTabs, onPluginDirty,
  harnessLaunch, scheduleLaunch, confirmQuit, cancelQuit, confirmUnsavedQuit, cancelUnsavedQuit,
  guardRef,
}: AppMainProps) {
  const pickerOverlays = <PickerOverlays {...pickers} />;
  const focusedAgentBody = (
    <AgentTabBody
        current={current} client={client} lines={lines} runCommand={runCommand}
        transcriptReference={transcriptReference} highlight={highlight} inputReference={inputReference}
        pickerOverlays={pickerOverlays}
        blockingOverlayOpen={commandBarSuppressed(pickers.overlays)}
        queueOpen={pickers.overlays.queue}
        search={search} globalHistory={globalHistory} commandDrafts={commandDrafts}
        onCommandBarSubmit={onCommandBarSubmit}
        quitConfirmOpen={quitConfirmOpen} unsavedQuitOpen={unsavedQuitOpen}
        recallReference={recallReference} onEditQueued={onEditQueued} onDeleteQueued={onDeleteQueued}
      dropRef={dropRef}
      onSplit={() => client.send({ method: 'moveTabToOtherPane', params: { index: activeTab } })}
    />
  );

  return (
    <AppShell
      tabs={tabs} client={client} dropRef={dropRef} editorDropRef={editorDropReference} tabNameMaxLength={tabNameMaxLength}
      targetCwd={current.cwd}
      activeTabNameMaxLength={activeTabNameMaxLength}
      sidebarLeftWidth={sidebarLeftWidth} onSidebarLeftWidthChange={setSidebarLeftWidth}
      sidebarRightWidth={sidebarRightWidth} onSidebarRightWidthChange={setSidebarRightWidth}
      focusLeft={focusLeft} focusRight={focusRight}
    >
      <AppCenterActionArea
        entries={actionEntries} tabs={tabs} activeTab={activeTab} secondaryTab={secondaryTab}
        client={client} closeTab={closeTab} tabNameMaxLength={tabNameMaxLength}
        activeTabNameMaxLength={activeTabNameMaxLength}
        onFocusCommandBar={() => inputReference.current?.focus()}
        onFocusEditor={(label) => tabHandles.current.get(label)?.focus()}
        windowFocused={windowFocused} current={current} focusedAgentBody={focusedAgentBody}
        commandDrafts={commandDrafts}
        dirtyTabs={dirtyPluginTabs}
        shellProps={{
          onHandle: (id, handle) => {
            if (handle) shellHandles.current.set(id, handle);
            else shellHandles.current.delete(id);
          },
        }}
        mountedProps={{
          harnessHandles, tabHandles, editorDropRef: editorDropReference, questionPanelRef,
          onPluginDirty,
          ...mountedPickerOverlayProps(pickers),
        }}
      />
      <AppReportingSection entries={reportingEntries} client={client} onClose={closeTab}
        heightPct={reportingHeightPct} onHeightPctChange={setReportingHeightPct} />
      {harnessLaunch && <HarnessLaunchDialog view={harnessLaunch} client={client} />}
      {scheduleLaunch && <ScheduleDialog view={scheduleLaunch} client={client} />}
      {quitConfirmOpen && <QuitDialog onConfirm={confirmQuit} onCancel={cancelQuit} />}
      {unsavedQuitOpen && <UnsavedQuitDialog onConfirm={confirmUnsavedQuit} onCancel={cancelUnsavedQuit} />}
      <CloseSaveGuard tabs={tabs} tabHandles={tabHandles} client={client} guardRef={guardRef} />
    </AppShell>
  );
}
