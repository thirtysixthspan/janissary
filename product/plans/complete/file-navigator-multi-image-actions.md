# Apply file navigator actions to selected images

**Complexity: 3/10** — the navigator already holds an ordered multi-selection and routes its existing Open and Edit actions through the ordinary file commands. This change only identifies homogeneous image selections through the image plugin’s shared contract, then applies those existing actions to every selected path.

## Goal

When a context menu is opened on one image within a multi-image selection, **Open** opens every selected image and **Edit** opens every selected image in the image editor.

## Approach

Keep ordinary single-row and mixed-type menus unchanged. Share the image-path predicate from the image plugin contract so the navigator does not duplicate the plugin’s extension list. When the right-clicked row belongs to a selection of two or more images, run the existing Open or Edit route once for each selected path in selection order.

## Implementation steps

1. Export an image-path predicate from the image shared contract and use it in `FileNavigatorTab` to identify a homogeneous selected image set.
2. Route context-menu Open and Edit through every path in that set, retaining the current clicked-row behavior for every other menu.
3. Add navigator coverage for multi-image Open and Edit, then update the functional and user documentation.

## Tests

- `web/src/FileNavigatorTab.test.tsx` verifies Open and Edit each dispatch once per selected image, in selection order, and that a non-image selection still affects only the clicked row.

## Spec updates

- `product/specs/file-navigator-tab.md` documents the multi-image context-menu exception.

## Docs

- `documentation/user-documentation/tab-types/file-navigator.md` documents the same visible behavior.

## Out of scope

- Batch editing in one image editor.
- Multi-selection behavior for non-image files or the **Open with** chooser.
