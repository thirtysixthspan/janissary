import React, { useEffect, useRef } from 'react';

type Properties = {
  items: string[];
  selected: number;
  onPick: (item: string) => void;
};

export function ShellCompletionPicker({ items, selected, onPick }: Properties) {
  const containerReference = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerReference.current?.querySelector('.picker-row.selected')?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  return (
    <div className="picker shell-completions" ref={containerReference}>
      <div className="picker-title">completions</div>
      {items.map((item, index) => (
        <div
          key={item}
          className={`picker-row${index === selected ? ' selected' : ''}`}
          onMouseDown={(event) => { event.preventDefault(); }}
          onClick={() => { onPick(item); }}
        >
          {item}
        </div>
      ))}
    </div>
  );
}
