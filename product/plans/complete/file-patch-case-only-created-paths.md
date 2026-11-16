# Share case-only patch places for paths the patch itself creates on a case-insensitive volume

**Complexity: 4/10** — ~55 added production lines, 1 existing production file, 7 requirements, 9 scenarios, 6 new units (p=5.11)

## Goal

On a volume that ignores letter case, two patch sections that name the same not-yet-created path in different case must act on one planned place. `*** Add File: a.txt` followed by `*** Add File: A.txt` fails section 2 with `File already exists` and leaves every path unchanged; an Update or Delete through the other spelling acts on the added `a.txt`; and a nested `a/b/file` plus `A/b/file` pair shares one place and one set of planned folders. On a volume that distinguishes case, the same spellings remain distinct paths, exactly as they are today.

## Approach

`placeKeys` in `src/file-patch/view-entry.ts` resolves an existing target through `realpathSync.native`, so existing files and links already collapse case-only spellings to one place. A missing target has no canonical case, so `placeKeys` keeps the typed spelling in `target.realPath`, and `createPatchView` keys the place by that location. Two missing spellings therefore produce two places, two writes, and rows that claim two added paths while the second write wins.

The view needs one read-only probe of the volume's case behavior, cached for the view, and a second case-folded location index that exists only when that probe reports a case-insensitive volume. `resolvePath` consults the folded index after its exact-location and link-identity lookups. Reusing the place makes a second Add see `exists` true, so the existing `add` step refuses with `File already exists` before any change is committed, and makes Update and Delete through the other spelling mutate the same place and content. The planned-folder index is keyed case-folded on the same volume so a case-only duplicate nested path and a planned folder under either spelling collide as they do on disk. When the probe reports a case-sensitive volume, both indexes keep exact keys and behavior is unchanged.

The probe only reads. It takes an existing entry under the root, toggles one ASCII letter's case, and confirms the toggled path names the same entry by device/inode and canonical realpath. An empty root falls back to the root's own basename under its nearest existing ancestor. A missing or different toggled entry means case-sensitive, which is the safe answer: distinct files are never merged.

## Implementation steps

1. Add `src/file-patch/volume-case.ts` exporting `volumeIgnoresCase(root)`. It finds a candidate name with an ASCII letter among the root's entries, falling back to the root's own basename, toggles one letter, and returns whether the toggled path and the original are the same entry (`lstatSync` device and inode plus equal `realpathSync.native`). It writes nothing and returns false when no candidate or no readable folder exists.
2. In `src/file-patch/view.ts`, add a `caseInsensitive = volumeIgnoresCase(root)` parameter so tests can pin either volume outcome. Create a folded location map, and populate it only when the probe says case-insensitive. Add a folded lookup that falls back from the exact place map, key the planned-folder counts through a case-folding helper on that volume, and use the folded place lookup for the missing-folder collision check. In `resolvePath`, consult the folded place after the exact location and link identity lookups, before creating a missing place, keeping the existing `implicit` clearing.
3. In `src/file-patch/view.test.ts`, add guarded cases for the case-insensitive outcome: Add/Add shares one place, Add/Update shares one place and content, Add/Delete shares one place through the removal, and a nested `a/b/file` plus `A/b/file` pair shares one place, one set of planned folders, and still refuses `A/b` as a planned folder. Add unguarded cases with the injected probe pinned true and false so the folding logic and the exact-key path are both exercised on any volume, plus a probe case asserting `volumeIgnoresCase` agrees with a read-only case toggle of the test root.
4. In `src/file-patch/apply.test.ts`, add a guarded end-to-end case where `*** Add File: a.txt` followed by `*** Add File: A.txt` fails at section 2 with `File already exists. No files were changed.` and neither spelling exists on disk. Extend the same case to show an Add followed by an Update or Delete through the other spelling acts on the first path.
5. In `product/specs/acp.md`, under the file patch tool, state that on a case-insensitive volume sections naming the same path the patch creates in different letter case act on one file, so a duplicate Add fails `File already exists` and an Update or Delete through either spelling changes that file, while a case-sensitive volume keeps the spellings distinct.

## Tests

- `src/file-patch/view.test.ts`: a pending `a.txt` and `A.txt` resolve to one place, whose `exists` becomes true once added, which is what makes the second Add fail.
- `src/file-patch/view.test.ts`: a pending `notes/Todo.md` updated through `notes/todo.md` shares one place and one content record.
- `src/file-patch/view.test.ts`: a pending `a.txt` deleted through `A.TXT` shares one place and leaves one place with `exists` false.
- `src/file-patch/view.test.ts`: `a/b/file` and `A/B/FILE` share one place, one planned-folder list, and `A/b` is still refused as a planned folder.
- `src/file-patch/view.test.ts`: with the probe pinned true, folding applies on any volume; with it pinned false, `a.txt` and `A.txt`, and `a/b/file` and `A/b/file`, stay distinct.
- `src/file-patch/view.test.ts`: `volumeIgnoresCase` agrees with the read-only case toggle the existing case-only test uses.
- `src/file-patch/apply.test.ts`: a duplicate case-only Add fails before any disk write; Add then Update and Add then Delete through the other spelling apply to the added path.

## Out of scope

- Changing `resolveMutationTarget` in `src/file-write/target.ts`, the file-read policy, or how existing paths are canonicalized.
- Changing row output, commit ordering, restore behavior, or the patch parser.
- Changing `help/file.md`; its existing rule that Adding a path that exists fails `File already exists` already describes the corrected behavior.
- Rewriting the existing `unifies case-only file and link spellings on a case-insensitive volume`, planned-folder, or section-row cases.
