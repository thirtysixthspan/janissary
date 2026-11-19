import { useRef } from 'react';
import type React from 'react';
import type { HarnessModelPair } from './model-search';
import { ModelSearchList } from './ModelSearchList';
import { useModelSearch, type ModelSearchListState } from './useModelSearch';

type Properties = {
  ids: string[];
  roleEntries: readonly (readonly HarnessModelPair[])[];
  harness: string;
  value: string;
  onChange: (text: string) => void;
  placeholder: string;
  'aria-label': string;
  disabled?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onSubmit?: () => void;
  onListChange?: (state: ModelSearchListState) => void;
};

export function ModelSearchInput({ ids, roleEntries, harness, value, onChange, placeholder, 'aria-label': ariaLabel, disabled = false, inputRef, onSubmit, onListChange }: Properties) {
  const ownRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? ownRef;
  const search = useModelSearch({ ids, roleEntries, harness, text: value, onChangeText: onChange, disabled, onSubmit, onListChange });

  return (
    <div className="model-search">
      <input
        ref={ref}
        type="text"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        disabled={disabled}
        onFocus={search.onFocus}
        onBlur={search.onBlur}
        onKeyDown={search.onKeyDown}
        onChange={(event) => search.onChange(event.currentTarget.value)}
      />
      {search.open && (
        <ModelSearchList
          rows={search.rows}
          highlighted={search.highlighted}
          blank={search.blank}
          anchorRef={ref}
          onHover={search.onHover}
          onPick={search.onPick}
        />
      )}
    </div>
  );
}
