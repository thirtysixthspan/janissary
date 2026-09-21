import React from 'react';

type Properties = {
  className: string;
  value: string;
  maxLength?: number;
  size?: number;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  onClick?: (e: React.MouseEvent) => void;
};

// A text field for the "double-click to rename/edit, Enter or blur to commit, Escape to cancel"
// pattern shared by the page-URL editor and the tab-rename editor. Always mounted freshly (the
// caller only renders it while editing), so `autoFocus` + select-on-focus puts the caret in a
// ready-to-type state with no explicit ref plumbing.
export function InlineEditInput({ className, value, maxLength, size, onChange, onCommit, onCancel, onClick }: Properties) {
  return (
    <input
      className={className}
      value={value}
      maxLength={maxLength}
      size={size}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onClick={onClick}
      onChange={(e) => onChange(e.currentTarget.value)}
      onBlur={onCommit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.currentTarget.blur(); }
        else if (e.key === 'Escape') { onCancel(); }
      }}
    />
  );
}
