import React from 'react';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from './ws';
import type { DirtyTabHandle, HarnessTabHandle } from './tab-handles';
import { EditorTab } from './editor/EditorTab';
import type { EditorDropHandle } from './drop-handles';
import { HarnessTabLayer } from './harness/HarnessTabLayer';
import type { PickerOverlayProps } from './pickers/picker-overlay-props';
import { TaskPicker } from './pickers/TaskPicker';
import { TabNavPicker } from './pickers/TabNavPicker';
import { QuestionPanel } from './QuestionPanel';
import type { QuestionPanelHandle } from './tab-handles';
import { tabBodyBorder } from './tab-body-border';
import { PluginTabLayer } from './plugins/PluginTabLayer';
import { indexedTabs, isHarnessTabView, isEditorTabView, isPluginTabView } from './shared/tab-view-guards';

type Properties = {
  tabs: TabView[];
  current: TabView;
  client: JanusClient;
  closeTab: (index: number) => void;
  harnessHandles: React.RefObject<Map<string, HarnessTabHandle>>;
  tabHandles: React.RefObject<Map<string, DirtyTabHandle>>;
  editorDropRef?: React.RefObject<EditorDropHandle | null>;
  questionPanelRef?: React.RefObject<QuestionPanelHandle | null>;
  visibleLabels?: string[];
  onSplit?: (index: number) => void;
  // Told when a plugin tab's unsaved state changes, so the tab strip can mark it. The handle itself
  // goes into `tabHandles` beside the editor tabs'; this is only the signal that it moved.
  onPluginDirty?: (label: string, dirty: boolean) => void;
  // Ctrl+A and Ctrl+G open the task picker and tab navigator from a focused harness tab (see
  // `HarnessTab.harnessKeyFilter`); they're the only pickers/choosers those chords ever let bubble
  // there, so this renders just those two overlays rather than the full `PickerOverlays` stack the
  // agent-tab body uses.
} & PickerOverlayProps;

function TabBodyDiv({
  tab, index, current, visibleLabels, children,
}: { tab: TabView; index: number; current: TabView; visibleLabels: string[]; children: React.ReactNode }) {
  return (
    <div
      className="tab-body"
      data-pane-index={index}
      style={{
        borderLeft: tabBodyBorder(tab.dotColor, tab.label === current.label),
        display: visibleLabels.includes(tab.label) ? 'flex' : 'none',
        gridColumn: tab.pane === 'right' ? 2 : 1,
        gridRow: 2,
      }}
    >
      {children}
    </div>
  );
}

// Harness, editor, and plugin tabs stay mounted (hidden when inactive) so terminal/xterm state,
// editor buffers, undo stacks, cursor/scroll position, embedded-page navigation, and video playback
// position survive tab switches. Split out of App.tsx to keep it under the file-size limit.
export function MountedViewLayers({
  tabs, current, client, closeTab, harnessHandles, tabHandles, editorDropRef, questionPanelRef,
  visibleLabels = [current.label], onSplit, onPluginDirty,
  taskPickerOpen, taskRows, taskPickerIndex, onPickTask, onToggleTaskDir,
  navOpen, navQuery, navIndex, onPickTab,
}: Properties) {
  return (
    <>
      {indexedTabs(tabs, isHarnessTabView).map(({ t, index }) => (
        <HarnessTabLayer
          key={t.harness.ptyId}
          t={t} current={current} client={client} harnessHandles={harnessHandles}
          visible={visibleLabels.includes(t.label)} index={index}
          onSplit={onSplit ? () => onSplit(index) : undefined}
          taskPickerOpen={taskPickerOpen} navOpen={navOpen}
          pickerOverlays={t.label === current.label && (
            <>
              {taskPickerOpen && onPickTask && onToggleTaskDir && (
                <TaskPicker rows={taskRows ?? []} selected={taskPickerIndex ?? 0} onPick={onPickTask} onToggleDir={onToggleTaskDir} />
              )}
              {navOpen && onPickTab && (
                <TabNavPicker tabs={tabs} query={navQuery ?? ''} selected={navIndex ?? 0} onPick={onPickTab} />
              )}
            </>
          )}
        />
      ))}

      {indexedTabs(tabs, isEditorTabView).map(({ t, index }) => (
        <TabBodyDiv key={t.label} tab={t} index={index} current={current} visibleLabels={visibleLabels}>
          <EditorTab editor={t.editor} tab={t} client={client} active={t.label === current.label} dropRef={editorDropRef}
            onSplit={onSplit ? () => onSplit(index) : undefined}
            ref={(h) => { if (h) tabHandles.current.set(t.label, h); else tabHandles.current.delete(t.label); }} />
        </TabBodyDiv>
      ))}

      {indexedTabs(tabs, isPluginTabView)
        .filter(({ t }) => !t.dock)
        .map(({ t, index }) => (
          <PluginTabLayer
            key={t.label}
            tab={t}
            index={index}
            current={current}
            visible={visibleLabels.includes(t.label)}
            client={client}
            onClose={() => closeTab(index)}
            onSplit={onSplit ? () => onSplit(index) : undefined}
            onDirtyHandle={(handle) => {
              if (handle) tabHandles.current.set(t.label, handle);
              else tabHandles.current.delete(t.label);
              onPluginDirty?.(t.label, handle?.isDirty() ?? false);
            }}
          />
        ))}
      {current.pendingQuestion && <QuestionPanel ref={questionPanelRef} question={current.pendingQuestion} client={client} />}
    </>
  );
}
