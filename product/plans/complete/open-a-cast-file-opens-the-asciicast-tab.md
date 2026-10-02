# A `.cast` file given to `open` opens the asciicast tab

**Complexity: 1/10** — the behavior already holds. What this entry adds is the test that says so at the level it is stated: today the only assertion about `.cast` and `open` is that the registry knows the extension, which is a fact about a lookup table rather than about a command the user types.

`open <file>.cast` reaches the asciicast plugin's inline opener, which opens or focuses the
**asciicast tab** playing that recording, and a file navigator row for a `.cast` activates with
`open`, so double-clicking one reaches the same tab. Neither is new: the plugin has claimed `.cast`
since it was written, and `open`'s dispatch is the registry that claim lives in. The rename and the
`play` command that replaced `harness replay` did not change any of that.

So there is nothing to build. What there is instead is a gap in what the tests would catch: the
existing case in `src/plugins/asciicast/activate.test.ts` asserts
`openerForExtension('.cast')?.name === 'asciicast'`, which is a statement about a registry. If the
`open` pipeline were ever wired to consult something other than that registry, or the navigator's row
resolution stopped following it, every existing test would still pass while `open session.cast` quietly
opened the plain-text editor.

## Design decisions

**The test drives the real command, not the table.** It goes through `OpenFileManager.run`, which is
what `open` resolves to, and asserts the plugin's inline opener is asked for the resolved file with the
originating tab and command as its origin. That is the same assertion style
`src/open/file-manager.test.ts` already uses for the markdown plugin, so the case sits beside its
peers rather than inventing a shape.

**The navigator row is pinned too, because that is a second claim and a second way in.** A `.cast` row
activating with `open` is what makes double-clicking a recording work, and it is a separate function
from the command's. One case each, both one line.

**No source file changes.** There is nothing to fix, and writing a change to look like there was would
be worse than none — the plugin's claim is already the mechanism, and a second route to it would be a
second thing to keep in step.

## What already exists (reuse, don't rebuild)

| Piece | Where |
| --- | --- |
| The claim that makes it work | `fileExtensions: { '.cast': 'application/x-asciicast' }` in `src/plugins/asciicast/manifest.ts` |
| The dispatcher `open` and the navigator both resolve through | `openerForExtension` in `src/openers/index.ts` |
| What the plugin does with the file | `opener.inline` in `src/plugins/asciicast/activate.ts` — opens or focuses a tab titled `asciicast: <label>` |
| The markdown case to sit beside | `src/open/file-manager.test.ts` § `OpenFileManager.run` |

## Proposed changes

Tests only:

- `src/open/file-manager.test.ts`: `open <file>.cast` asks the asciicast plugin's inline opener for the
  resolved file.
- `src/file-navigator/openers-for-row.test.ts`: a `.cast` row activates with `open` rather than
  offering the chooser, and its forced chooser leads with `Open as asciicast`.

## Specs

None. `product/specs/open.md` already says a `.cast` is claimed by the asciicast plugin, and
`product/specs/harness-recording.md` § Retrieval already says `open <file>.cast` opens the asciicast
tab — both were written when the `play` command landed, and both are accurate now. There is no
behavior here that is undocumented; what there was is a behavior that was untested.

## Out of scope

- **`play`**, which reaches the same tab from the file's type rather than from `open`'s dispatcher, and
  is covered by its own tests.
- The file navigator's other gestures on a `.cast` row. Shift-activation answers `edit`, because the
  asciicast plugin declares no `editGesture` and no `editsOwnFiles`, and a recording has nothing to
  edit as text — the same as before and correct now.
- Whether a recording that cannot be parsed opens a tab at all. It does, with the reason on its metadata
  line, and that is the plugin's own behavior with its own tests.

## Verification

`./scripts/run.mjs check-diff`.