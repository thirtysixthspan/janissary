import React, { useRef, useState } from 'react';
import type { TabView } from '@shared/protocol';

type Properties = {
  tab: TabView;
  index: number;
  active: boolean;
  onSelect: (index: number) => void;
  onClose: (index: number) => void;
  onRename: (index: number, title: string) => void;
  tabNameMaxLength: number;
};

export function TabItem({ tab, index, active, onSelect, onClose, onRename, tabNameMaxLength }: Properties) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  // Escape cancels and blurs the input; the resulting blur event must not also commit.
  const cancelledRef = useRef(false);

  const startEdit = () => { cancelledRef.current = false; setDraft(tab.title ?? tab.label); setEditing(true); };

  const commit = () => {
    if (cancelledRef.current) return;
    setEditing(false);
    onRename(index, draft);
  };

  const cancel = () => { cancelledRef.current = true; setEditing(false); };

  return (
    <div
      className={`tab${active ? ' active' : ''}`}
      style={{ borderTopColor: tab.groupColor }}
      onClick={() => onSelect(index)}
    >
      <span className={`dot${tab.busy ? ' busy' : ''}`} style={{ color: tab.dotColor }}>●</span>
      {editing ? (
        <input
          className="tab-rename-input"
          value={draft}
          maxLength={tabNameMaxLength}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setDraft(e.currentTarget.value.slice(0, tabNameMaxLength))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.currentTarget.blur(); }
            else if (e.key === 'Escape') { cancel(); }
          }}
        />
      ) : (
        <span onClick={(e) => {
          if (!active) return;
          e.stopPropagation();
          startEdit();
        }}
        >{tab.title ?? tab.label}</span>
      )}
      {tab.hasUnread && <span className="tab-badge" role="img" aria-label="unread">✨</span>}
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
  );
}
