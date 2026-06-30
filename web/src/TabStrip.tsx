import React from 'react';
import type { TabView } from '@shared/protocol';

type Properties = {
  tabs: TabView[];
  activeTab: number;
  onSelect: (index: number) => void;
  onClose: (index: number) => void;
};

export function TabStrip({ tabs, activeTab, onSelect, onClose }: Properties) {
  return (
    <div className="tabstrip">
      {tabs.map((tab, index) => (
        <div
          key={tab.label}
          className={`tab${index === activeTab ? ' active' : ''}`}
          style={{ borderTopColor: tab.groupColor }}
          onClick={() => onSelect(index)}
        >
          <span className={`dot${tab.busy ? ' busy' : ''}`} style={{ color: tab.dotColor }}>●</span>
          <span>{tab.title ?? tab.label}</span>
          <button
            type="button"
            className="tab-close"
            title="Close tab"
            aria-label="Close tab"
            onClick={(e) => { e.stopPropagation(); onClose(index); }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
