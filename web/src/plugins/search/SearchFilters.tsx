import React from 'react';

export type SearchFiltersProperties = {
  include: string;
  exclude: string;
  onChangeInclude(value: string): void;
  onChangeExclude(value: string): void;
};

// The two narrowing fields, in the metadata bar rather than between the bar and the results: they
// choose which files the query runs against, not what the query says, so they sit with the tab's
// settings. Each reruns the search as it is typed.
export function SearchFilters({
  include, exclude, onChangeInclude, onChangeExclude,
}: SearchFiltersProperties) {
  return (
    <div className="search-filters">
      <input
        value={include}
        spellCheck={false}
        placeholder="Files to include"
        aria-label="Files to include"
        onChange={(event) => onChangeInclude(event.target.value)}
      />
      <input
        value={exclude}
        spellCheck={false}
        placeholder="Files to exclude"
        aria-label="Files to exclude"
        onChange={(event) => onChangeExclude(event.target.value)}
      />
    </div>
  );
}
