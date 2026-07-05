# Place file tree tabs at the beginning of the tab group

**Complexity: 2/10** — add a `position` parameter to `insertTabInGroup` and pass `'start'` from `addFilesTab`.

## Goal

When a file tree tab is opened with `files [path]`, it should appear at the beginning (leftmost) of its tab group, not at the end where other tab types land.

## Background

`insertTabInGroup` (tab-utils.ts) always inserts the new tab after the last same-group tab. File tree tabs are structural/navigation views that make more sense at the left edge of the group, before content tabs.

## Approach

Add an optional `position: 'start' | 'end'` parameter to `insertTabInGroup`. Pass `'start'` from `addFilesTab`, keeping the `'end'` default for all other tab types.

## Implementation

1. **`src/tab-utils.ts`** (line 35): Add `position: 'start' | 'end' = 'end'` parameter. When `'start'`, insert at the first same-group tab's index (break after first match). When `'end'`, keep the current behavior (walk through, insert after last match).

2. **`src/tab-creators.ts`** (line 84): Change `insertTabInGroup(tabs, tab)` to `insertTabInGroup(tabs, tab, 'start')`.

3. **Tests**: Add a test for `insertTabInGroup` with `position: 'start'`.

## Tests

- `src/tab-utils.test.ts`: Test `insertTabInGroup` inserts before the first same-group tab when `position: 'start'`.

## Out of scope

- Changing placement for other tab types (image, markdown, editor, page).
