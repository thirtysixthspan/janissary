import React from 'react';
import type { TabView } from '@shared/protocol';
import { TabItem, type TabItemActions } from './TabItem';

type Properties = TabItemActions & {
  tabs: TabView[];
  activeTab: number;
  windowFocused?: boolean;
};

export function TabStrip({
  tabs, activeTab, onSelect, onClose, onRename, tabNameMaxLength, activeTabNameMaxLength = 50, onFocusCommandBar, windowFocused,
}: Properties) {
  return (
    <div className="tabstrip" data-doc-shot="tab-strip">
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
          windowFocused={windowFocused}
        />
      ))}
    </div>
  );
}
