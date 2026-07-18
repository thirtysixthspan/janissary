# File search path line gets a `>` prefix

**Complexity: 1/10** — one-line JSX change in `FileSearchPopup`, plus a spec update and a small test.

## Goal

In the file navigator's Search-files pop-up (`FileSearchPopup`), the path line shown below the input for the current best match should be prefixed with `> `, e.g.:

```
task
> /src/tasks.md
```

The placeholder text shown when loading (`Searching…`) or when nothing matches (`(no matching files)`) should NOT get the prefix — only an actual matched path.

## Background

`web/src/FileSearchPopup.tsx` computes `best` (the top matching path from `bestFileMatch`) and `line` (via the local `pathLine` helper, which returns `'Searching…'`, `null`, `best`, or `'(no matching files)'` depending on state). Line 57 renders `line` verbatim inside `<div className="search-result">`.

There's no existing distinction in the rendered JSX between "line is a real match" and "line is a placeholder" — that needs to be added so only the real match gets prefixed.

## Approach

In `FileSearchPopup`, derive a separate display string that prefixes `line` with `> ` only when `line === best` (i.e. only when the path line is actually showing the matched path, not a placeholder). Leave `pathLine` itself unchanged.

## Implementation steps

1. **Update `FileSearchPopup.tsx`** — after computing `line`, compute a `display` value: `best !== undefined && line === best ? \`> ${line}\` : line`. Render `display` instead of `line` in the `search-result` div.
2. **Update spec** — `product/specs/file-tree-tab.md`, "Finding a file by name" section: note the path line is prefixed with `> `.
3. **Run `./scripts/run.mjs check-diff`**.

## Tests

Add a test (no dedicated `FileSearchPopup.test.tsx` exists yet — check whether `QuickOpen.test.tsx` or another web test already renders `FileSearchPopup` directly; if not, create `web/src/FileSearchPopup.test.tsx`) covering:

- A query with a match renders `> <path>` in `.search-result`.
- A query with no match renders `(no matching files)` with no `> ` prefix.
- While `loading` is true, renders `Searching…` with no `> ` prefix.

## Out of scope

- Changing the matching/ranking logic in `file-search-match.ts`.
- Any change to the ghost-completion text in the input itself.
- The unrelated "quick search" (Cmd+P `QuickOpen`) highlighting/limit issues — those are separate backlog items.

## Verification

`./scripts/run.mjs check-diff` must pass clean. Manual: open the file navigator's search pop-up, type a query that matches a file, verify the path line reads `> <path>`.
