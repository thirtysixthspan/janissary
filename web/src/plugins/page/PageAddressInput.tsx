import React from 'react';

// The address field behind double-clicking a page tab's address: Enter or clicking away loads what
// was typed, Escape leaves the tab where it is. Rendered only while editing, so `autoFocus` plus
// select-on-focus lands the caret ready to type without any ref plumbing.
export function PageAddressInput({
  value, onChange, onCommit, onCancel,
}: {
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  return (
    <input
      className="page-url-input"
      value={value}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => onChange(e.currentTarget.value)}
      onBlur={onCommit}
      onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') { e.currentTarget.blur(); }
        else if (e.key === 'Escape') { onCancel(); }
      }}
    />
  );
}
