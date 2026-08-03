import React from 'react';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from './ws';
import type { HarnessTabHandle } from './HarnessTab';
import { EditorTab, type EditorTabHandle, type EditorDropHandle } from './EditorTab';
import { PageTab } from './PageTab';
import { HarnessTabLayer } from './HarnessTabLayer';
import type { PickerOverlayProps } from './picker-overlay-props';
import { QuestionPanel, type QuestionPanelHandle } from './QuestionPanel';
import { tabBodyBorder } from './tab-body-border';
import { PluginTabLayer } from './plugins/PluginTabLayer';

type Properties = {
  tabs: TabView[];
  current: TabView;
  client: JanusClient;
  closeTab: (index: number) => void;
  harnessHandles: React.RefObject<Map<string, HarnessTabHandle>>;
  editorHandles: React.RefObject<Map<string, EditorTabHandle>>;
  editorDropRef?: React.RefObject<EditorDropHandle | null>;
  questionPanelRef?: React.RefObject<QuestionPanelHandle | null>;
  visibleLabels?: string[];
  onSplit?: (index: number) => void;
  // Ctrl+A and Ctrl+G open the task picker and tab navigator from a focused harness tab (see
  // `HarnessTab.harnessKeyFilter`); they're the only pickers/choosers those chords ever let bubble
  // there, so this renders just those two overlays rather than the full `PickerOverlays` stack the
  // agent-tab body uses.
} & PickerOverlayProps;

// Harness, editor, page, and plugin tabs stay mounted (hidden when inactive) so terminal/xterm
// state, editor buffers, undo stacks, cursor/scroll position, embedded-page navigation, and video
// playback position survive tab switches. Split out of App.tsx to keep it under the file-size limit.
export function MountedViewLayers({
  tabs, current, client, closeTab, harnessHandles, editorHandles, editorDropRef, questionPanelRef,
  visibleLabels = [current.label], onSplit,
  taskPickerOpen, taskRows, taskPickerIndex, onPickTask, onToggleTaskDir,
  navOpen, navQuery, navIndex, onPickTab,
}: Properties) {
  return (
    <>
      {tabs.map((t, index) => ({ t, index })).filter(({ t }) => t.view === 'harness' && t.harness).map(({ t, index }) => (
        <HarnessTabLayer
          key={t.harness!.ptyId}
          t={t} current={current} tabs={tabs} client={client} harnessHandles={harnessHandles}
          visible={visibleLabels.includes(t.label)} index={index}
          onSplit={onSplit ? () => onSplit(index) : undefined}
          taskPickerOpen={taskPickerOpen} taskRows={taskRows} taskPickerIndex={taskPickerIndex}
          onPickTask={onPickTask} onToggleTaskDir={onToggleTaskDir}
          navOpen={navOpen} navQuery={navQuery} navIndex={navIndex} onPickTab={onPickTab}
        />
      ))}

      {tabs.map((t, index) => ({ t, index })).filter(({ t }) => t.view === 'editor' && t.editor).map(({ t, index }) => (
        <div
          key={t.label}
          className="tab-body"
          data-pane-index={index}
          style={{
            borderLeft: tabBodyBorder(t.dotColor, t.label === current.label),
            display: visibleLabels.includes(t.label) ? 'flex' : 'none',
            gridColumn: t.pane === 'right' ? 2 : 1,
            gridRow: 2,
          }}
        >
          <EditorTab editor={t.editor!} tab={t} client={client} active={t.label === current.label} dropRef={editorDropRef}
            onSplit={onSplit ? () => onSplit(index) : undefined}
            ref={(h) => { if (h) editorHandles.current.set(t.label, h); else editorHandles.current.delete(t.label); }} />
        </div>
      ))}

      {tabs
        .map((t, index) => ({ t, index }))
        .filter(({ t }) => t.view === 'page' && t.page)
        .map(({ t, index }) => (
          <div
            key={t.page!.url}
            className="tab-body"
            data-pane-index={index}
            style={{
              borderLeft: tabBodyBorder(t.dotColor, t.label === current.label),
              display: visibleLabels.includes(t.label) ? 'flex' : 'none',
              gridColumn: t.pane === 'right' ? 2 : 1,
              gridRow: 2,
            }}
          >
            <PageTab
              page={t.page!} closeTab={closeTab} index={index} client={client}
              active={t.label === current.label}
              onSplit={onSplit ? () => onSplit(index) : undefined}
            />
          </div>
        ))}
      {tabs
        .map((t, index) => ({ t, index }))
        .filter(({ t }) => t.view === 'plugin' && t.plugin)
        .map(({ t, index }) => (
          <PluginTabLayer
            key={t.label}
            tab={t}
            index={index}
            current={current}
            visible={visibleLabels.includes(t.label)}
            client={client}
            onSplit={onSplit ? () => onSplit(index) : undefined}
          />
        ))}
      {current.pendingQuestion && <QuestionPanel ref={questionPanelRef} question={current.pendingQuestion} client={client} />}
    </>
  );
}
