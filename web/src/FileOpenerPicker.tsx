import React from 'react';
import type { FileOpenerChoice } from '@shared/protocol';

type Properties = {
  name: string;
  choices: FileOpenerChoice[];
  selected: number;
  onPick: (index: number) => void;
};

export function FileOpenerPicker({ name, choices, selected, onPick }: Properties) {
  return (
    <div className="picker file-opener-picker" role="dialog" aria-label={`Open ${name}`}>
      <div className="picker-title">Open {name} with</div>
      {choices.map((choice, index) => (
        <div
          key={choice.command}
          className={`picker-row${index === selected ? ' selected' : ''}`}
          onClick={() => onPick(index)}
        >
          {choice.label}
        </div>
      ))}
    </div>
  );
}
