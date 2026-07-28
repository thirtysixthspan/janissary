import React from 'react';
import type { TabView } from '@shared/protocol';
import { TabItem, type TabItemActions } from './TabItem';
import { useTabReorder } from './useTabReorder';

type Properties = TabItemActions & {
  tabs: TabView[];
  activeTab: number;
  windowFocused?: boolean;
  startControl?: React.ReactNode;
  endControl?: React.ReactNode;
  onReorder?: (from: number, to: number) => void;
  className?: string;
};

export function TabStrip({
  tabs, activeTab, onSelect, onClose, onRename, tabNameMaxLength, activeTabNameMaxLength = 50,
  onFocusCommandBar, onFocusEditor, windowFocused, startControl, endControl,
  onReorder, className,
}: Properties) {
  const reorder = useTabReorder(tabs, onReorder);
  return (
    <div className={`tabstrip${className ? ` ${className}` : ''}`} data-doc-shot="tab-strip" ref={reorder.stripRef}>
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
          dragTransform={reorder.transformFor(index)}
          onReorderMouseDown={(event) => reorder.begin(index, event)}
        />
      ))}
      {endControl}
    </div>
  );
}
