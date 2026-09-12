# Pass the file-navigator port closures by name

**Complexity: 3/10** — one exported type, two factory signatures, one manager method, and a colocated test for the factories. Three files touched plus one new test file. No behavior a user can observe changes.

`FileNavigatorManager.portClosures()` returns a four-element tuple typed `[NavPort['watchDir'], NavPort['unwatchDir'], NavPort['rebuild'], NavPort['refreshGit']]`, spread into `makeNavigationPort(...)` and `makeOpenPort(...)`, which each re-enumerate the same four as positional parameters. Two of the four — `rebuild` and `refreshGit` — are both `(label: string) => void`, so transposing them typechecks in all three places and hands `refreshGit` where `rebuild` was expected. Adding a fifth port member means editing the tuple type, the tuple literal, and two parameter lists in the right order.

## Goal

The four shared closures travel as one object keyed by name. A transposition becomes impossible to express, and adding a member is one property in one place.

## Design decisions

**The record is `Pick` of `BasePort`, not a hand-written interface.** `src/file-navigator/port.ts` already declares `watchDir`, `unwatchDir`, `rebuild`, and `refreshGit` as the members both ports share. `export type PortClosures = Pick<BasePort, 'watchDir' | 'unwatchDir' | 'rebuild' | 'refreshGit'>` derives the record from the contract it feeds, so a signature change on `BasePort` propagates rather than drifting — and it lives beside `BasePort` where both port modules already look.

**The factories take the record as one argument and spread it.** `makeNavigationPort(managers, states, closures)` returns `{ states, ...closures, setCwd, hasTab }`. Spreading rather than destructuring-and-relisting is what removes the second enumeration: a member added to `PortClosures` reaches both ports with no edit here.

**`portClosures()` keeps its name and stays private.** It is still "the bound closures both ports share"; only its shape changes, from a tuple to an object literal whose keys the compiler checks against `PortClosures`.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The four shared members, already declared together | `src/file-navigator/port.ts` (`BasePort`) |
| The two port shapes built on it | `src/file-navigator/navigation.ts` (`NavPort`), `src/file-navigator/open.ts` (`OpenPort`) |
| The two factories | `src/file-navigator/manager-ports.ts` |
| The single producer of the closures | `src/file-navigator/manager.ts` (`portClosures`, `navPort`, `openPort`) |

## Implementation steps

1. **`src/file-navigator/port.ts`:** export `type PortClosures = Pick<BasePort, 'watchDir' | 'unwatchDir' | 'rebuild' | 'refreshGit'>`.

2. **`src/file-navigator/manager-ports.ts`:** change both factories' trailing four parameters to one `closures: PortClosures`, and build each port by spreading it.

3. **`src/file-navigator/manager.ts`:** `portClosures(): PortClosures` returns an object literal with the four named keys bound to the same methods as today; `navPort()` and `openPort()` pass `this.portClosures()` as a single argument instead of spreading.

## Tests

- **New `src/file-navigator/manager-ports.test.ts`** — the hazard the change removes, pinned directly: given a `PortClosures` whose four members are distinguishable spies, `makeNavigationPort` produces a port whose `rebuild` calls the `rebuild` spy and whose `refreshGit` calls the `refreshGit` spy (and likewise `watchDir`/`unwatchDir` with their arguments intact); `makeOpenPort` does the same and carries `managers` and `states` through; the navigation port's own `setCwd` reaches `managers.tab.setCwd` and `hasTab` answers from `managers.tab.tabs`.
- **Must keep passing unchanged:** `src/file-navigator/manager.test.ts`, `src/file-navigator/index.test.ts`, `src/controller/file-navigator.test.ts`, `src/file-navigator/navigation.test.ts`, `src/file-navigator/open.test.ts`.

## Out of scope

- **`MutationContext`** in `src/file-navigator/manager-mutations.ts`, which already passes its members by name.
- **Merging `NavPort` and `OpenPort`**, or changing what either exposes.
- **Any change to `watchDir`/`unwatchDir`/`rebuild`/`refreshGit` behavior**, or to the debounce that drives rebuilds.
