# `profile launch` opens a profile picker, like the task picker

**Complexity: 6/10** — a small new vertical slice (protocol field, server broadcast,
client picker hook/component, key handling, command-bar interception) with no existing
profile-list plumbing to build on, but every piece mirrors an existing, working picker
pattern closely.

## Goal

Running bare `profile launch` (no name) currently returns a usage error
(`Usage: profile launch <name>`). It should instead open a picker listing the available
profiles, mirroring the existing pickers' interaction pattern: arrow keys move the
selection, Enter/click populates the command line with `profile launch <name>` (not
submitting it, so the user can review/edit first), Escape closes it.

## Background (verified)

- `src/profiles.ts:25-35` (`listProfiles`) already returns a flat, alphabetically sorted
  `string[]` of profile directory names — no tree/hierarchy, unlike `ai/tasks/*.md`'s
  directory structure. This means the **simple, flat-list** picker pattern applies
  (`hist`/theme pickers), not the task picker's bespoke tree-dispatch code
  (`task-picker-keys.ts`) — I can reuse the existing generic `handlePickerKey`
  (`web/src/keyboard-handlers.ts:20-35`) instead of writing new key-dispatch logic.
- `src/profiles.ts:66-77` (`parseProfileCommand`) returns `{ error: 'Usage: profile
  launch <name>' }` when `profile launch` has no name — this fix intercepts that case
  **client-side** before the command ever reaches the server (exactly how `tasks` is
  intercepted in `web/src/useCommandBarSubmit.ts:42`), so this error path stays
  unchanged and still fires for any other malformed input; no server-side command
  parsing changes.
- The client has **zero** existing profile plumbing today (confirmed: no "profile"
  references anywhere under `web/src/`) — the list of profile names must be threaded
  from server to client the same way `tasks: listTasks()` already is
  (`src/protocol.ts:79`, `src/index.ts:60`, `web/src/ws.ts:3,29`,
  `web/src/useServerState.ts`).
- `web/src/useHistPicker.ts` and `web/src/HistoryPicker.tsx` are the closest existing
  pattern to copy: a flat list, `pickerOpen`/`pickerIndex` state, `openPicker`,
  and a `pick` handler — the only behavioral difference is that `hist`'s `pick` runs
  the picked command immediately, while this fix needs the **populate, don't submit**
  behavior `useTaskPicker.ts:28-37` (`pickTask`) already implements (including its
  harness-tab special case: send straight into the PTY when `harnessPtyId` is set,
  since a harness tab has no command line).
- `web/src/useWindowKeys.ts`'s `dispatchModalKey` (lines 68-98) is the priority chain
  every picker's keys go through; `web/src/PickerOverlays.tsx` is the mutually-exclusive
  overlay stack; `web/src/App.tsx` wires both plus `useCommandBarSubmit` — all three need
  the same handful of new props/branches every existing picker already has one copy of.
- `web/src/App.tsx` is 234 lines already (close to the 200-significant-line limit) — the
  new wiring must stay minimal per picker (a handful of destructured fields, matching
  the existing `useHistPicker`/`useTaskPicker` call-site footprint) rather than adding
  new inline logic; if `check-diff`'s lint step reports the file over budget, extract
  wiring into `useAppWindowKeys.ts` (already the seam for exactly this) rather than
  compacting existing code.

## Approach

Thread `profiles: string[]` through the existing state-broadcast plumbing (protocol →
`emitState` → `ws.ts` → `useServerState.ts`), add a `useProfilePicker.ts` hook mirroring
`useHistPicker.ts`'s shape with `useTaskPicker.ts`'s populate-not-submit `pick` behavior,
a `ProfilePicker.tsx` component mirroring `HistoryPicker.tsx`, wire it into the existing
picker priority chain (`useWindowKeys.ts`, `PickerOverlays.tsx`, `App.tsx`), and
intercept bare `profile launch` in `useCommandBarSubmit.ts` the same way `tasks` is
intercepted today.

## Implementation

1. **`src/protocol.ts`** — add `profiles: string[];` to `StateEvent` (`src/protocol.ts:79`,
   alongside `tasks: TaskRow[]`).

2. **`src/index.ts`** and **`src/message-handler.ts`** (the `init` RPC reply builds its
   own separate `StateEvent` literal) — import `listProfiles` from `./profiles.js`; add
   `profiles: listProfiles()` to both `emitState`'s (`src/index.ts:60`) and `init`'s
   (`src/message-handler.ts:13`) object literals, alongside
   `tasks: listTasks()`).

3. **`web/src/ws.ts`**
   - Add `profiles: string[]` as a new parameter to the `StateListener` type
     (`web/src/ws.ts:3`), after `tasks`.
   - Pass `event.profiles` in the dispatch call (`web/src/ws.ts:29`).

4. **`web/src/useServerState.ts`**
   - Add `setProfiles: (profiles: string[]) => void;` to `Setters`.
   - Destructure it, accept `nextProfiles` in the `onState` callback, call
     `setProfiles(nextProfiles)`.

5. **`web/src/useProfilePicker.ts`** (new file) — mirrors `useHistPicker.ts`'s
   `pickerOpen`/`pickerIndex` state shape, but with `pick` populating the command line
   (or harness PTY) instead of running immediately, following `useTaskPicker.ts`'s
   `pickTask`:
   ```ts
   import { useState } from 'react';
   import type { JanusClient } from './ws';

   export function useProfilePicker(
     recallRef: React.RefObject<((text: string) => void) | null>,
     inputRef: React.RefObject<HTMLTextAreaElement | null>,
     client: JanusClient,
     harnessPtyId: string | undefined,
   ) {
     const [profilePickerOpen, setProfilePickerOpen] = useState(false);
     const [profilePickerIndex, setProfilePickerIndex] = useState(0);

     const openProfilePicker = () => { setProfilePickerIndex(0); setProfilePickerOpen(true); };
     const pickProfile = (name: string) => {
       const text = `profile launch ${name}`;
       if (harnessPtyId) {
         client.send({ method: 'ptyInput', params: { id: harnessPtyId, data: text } });
       } else {
         recallRef.current?.(text);
         inputRef.current?.focus();
       }
       setProfilePickerOpen(false);
     };

     return { profilePickerOpen, profilePickerIndex, setProfilePickerIndex, setProfilePickerOpen, openProfilePicker, pickProfile };
   }
   ```

6. **`web/src/ProfilePicker.tsx`** (new file) — mirrors `HistoryPicker.tsx`:
   ```tsx
   import React from 'react';

   type Properties = { profiles: string[]; selected: number; onPick: (name: string) => void };

   export function ProfilePicker({ profiles, selected, onPick }: Properties) {
     return (
       <div className="picker" data-doc-shot="profile-overlay">
         <div className="picker-title">profiles</div>
         {profiles.length === 0 ? (
           <div className="picker-row picker-empty">(no profiles)</div>
         ) : (
           profiles.map((name, index) => (
             <div
               key={name}
               className={`picker-row${index === selected ? ' selected' : ''}`}
               onClick={() => onPick(name)}
             >
               {name}
             </div>
           ))
         )}
       </div>
     );
   }
   ```

7. **`web/src/useWindowKeys.ts`**
   - `StateSnapshot`: add `profilePickerOpen: boolean; profilePickerIdx: number; profiles: string[];`.
   - `Callbacks`: add `setProfilePickerIndex`, `setProfilePickerOpen`, `openProfilePicker`,
     `pickProfile`.
   - `dispatchModalKey`: add a branch (after `taskPickerOpen`, matching the other
     flat-list pickers' style):
     ```ts
     if (snap.profilePickerOpen) {
       handlePickerKey(e, snap.profiles, snap.profilePickerIdx, cb.setProfilePickerIndex, cb.pickProfile, cb.setProfilePickerOpen);
       return true;
     }
     ```

8. **`web/src/useCommandBarSubmit.ts`** — add `openProfilePicker: () => void;` to `Params`,
   destructure it, add `if (trimmed === 'profile launch') { openProfilePicker(); return; }`
   near the `tasks` interception.

9. **`web/src/PickerOverlays.tsx`** — add `profilePickerOpen`, `profiles`,
   `profilePickerIndex`, `onPickProfile` props and a render branch:
   `if (profilePickerOpen) return <ProfilePicker profiles={profiles} selected={profilePickerIndex} onPick={onPickProfile} />;`

10. **`web/src/App.tsx`**
    - `const [profiles, setProfiles] = useState<string[]>([]);`
    - `const { profilePickerOpen, profilePickerIndex, setProfilePickerIndex, setProfilePickerOpen, openProfilePicker, pickProfile } = useProfilePicker(recallReference, inputReference, client, current?.view === 'harness' ? current.harness?.ptyId : undefined);`
    - Add `setProfiles` to the `useServerState` setters object.
    - Add `profilePickerOpen` to the `pickerOpenRef` combination (alongside
      `queueOpen`/`taskPickerOpen`).
    - Pass the new fields into `useAppWindowKeys`, `useCommandBarSubmit`, and
      `PickerOverlays`.
    - Add `|| profilePickerOpen` to `CommandArea`'s combined `pickerOpen` prop
      (`web/src/App.tsx:214`).
    - If this pushes `App.tsx` over the 200-significant-line limit, extract the new
      picker's wiring block into `useAppWindowKeys.ts` rather than compacting existing
      lines (per `ai/guidelines/code-guidelines.md`).

## Tests

- `src/index.test.ts` or a small new server-side check: assert the `state` broadcast's
  `profiles` field reflects `listProfiles()` (mirroring however `tasks` is currently
  covered, if at all — check first).
- `web/src/useProfilePicker.test.ts` (new, mirroring `useHistPicker.test.ts`/
  `useTaskPicker.test.ts`'s shape): `openProfilePicker` opens at index 0;
  `pickProfile` populates the command line via `recallRef` and closes the picker;
  `pickProfile` sends `ptyInput` instead when `harnessPtyId` is set.
- `web/src/ProfilePicker.test.tsx` (new, mirroring `HistoryPicker`/`TaskPicker` test
  shape if one exists): renders the empty state; renders profile rows; highlights the
  selected row; clicking a row calls `onPick`.
- `web/src/useCommandBarSubmit.test.ts` — add a case: submitting `profile launch`
  (exactly, case-insensitive/trimmed) calls `openProfilePicker` instead of `runCommand`;
  `profile launch somename` still calls `runCommand` (unaffected).

## Verification

Manual: run the web app, type `profile launch` and press Enter, confirm a picker opens
listing the `profiles/` directory's entries; arrow through it, press Enter on one, and
confirm `profile launch <name>` appears in the command line without being submitted;
confirm Escape closes it; confirm `profile launch <existing-name>` (typed directly, not
via the picker) still runs normally. Not runnable in this environment — note as
unverified manually.

## Out of scope

- Any keybinding (e.g. a new Ctrl+ chord) to open the profile picker directly — the
  issue only asks for the bare `profile launch` command to trigger it, mirroring the
  task picker's *interaction pattern*, not necessarily its Ctrl+A binding.
- Profile management (create/delete/edit) — this fix only lists existing profiles.
- Any other issues in `work/issues.md`.
