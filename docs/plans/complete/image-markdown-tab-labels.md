# Use filenames as tab labels for image and markdown preview tabs

## Problem
Image and markdown preview tabs show generic labels (`image`, `image-2`, `markdown`, etc.) instead of the actual filename. Editor tabs already use the filename — image/markdown should do the same.

## Solution
Set `tab.title = view.name` in both `addImageTab` and `addMarkdownTab`, matching the existing pattern in `addEditorTab`.

## Changes

### `src/tab-creators.ts`
- `addImageTab`: add `tab.title = image.name.slice(0, getConfig().tabNameMaxLength)`
- `addMarkdownTab`: add `tab.title = view.name.slice(0, getConfig().tabNameMaxLength)`

### `src/controller.test.ts`
- Update image tab test assertions to expect the filename instead of `'image'`.

## Spec
Covered in `spec/tabs.md` — the "Tab display alias" section already documents that double-clicking the label opens a rename input and that display aliases are shown in the strip. No spec change needed for this fix.
