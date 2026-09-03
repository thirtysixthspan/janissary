import React from 'react';
import type { TabView } from '@shared/protocol';
import { TabItem, type TabItemActions } from './TabItem';
import { useTabReorder, type CrossStripDrop } from './useTabReorder';

type Properties = TabItemActions & {
  tabs: TabView[];
  activeTab: number;
  windowFocused?: boolean;
  startControl?: React.ReactNode;
  endControl?: React.ReactNode;
  onReorder?: (from: number, to: number) => void;
  crossStripDrop?: CrossStripDrop;
  className?: string;
};

export function TabStrip({
  tabs, activeTab, onSelect, onClose, onRename, tabNameMaxLength, activeTabNameMaxLength = 50,
  onFocusCommandBar, onFocusEditor, windowFocused, dirtyTabs, startControl, endControl,
  onReorder, crossStripDrop, className,
}: Properties) {
  const reorder = useTabReorder(tabs, onReorder, crossStripDrop);
  return (
    <div
      className={`tabstrip${className ? ` ${className}` : ''}`}
      data-doc-shot="tab-strip"
      data-tab-drop-zone={crossStripDrop?.zone}
      ref={reorder.stripRef}
    >
      {startControl}
      {tabs.map((tab, index) => (
        <TabItem
          key={tab.label}
          tab={tab}
          index={index}
          active={index === activeTab}
          onSelect={onSelect}
          onClose={onClose}
          onRename={onRename}
          tabNameMaxLength={tabNameMaxLength}
          activeTabNameMaxLength={activeTabNameMaxLength}
          onFocusCommandBar={onFocusCommandBar}
          onFocusEditor={onFocusEditor}
          windowFocused={windowFocused}
          dirtyTabs={dirtyTabs}
          dragTransform={reorder.transformFor(index)}
          onReorderMouseDown={(event) => reorder.begin(index, event)}
        />
      ))}
      {endControl}
    </div>
  );
}
