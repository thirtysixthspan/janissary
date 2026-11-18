# Give `usePopulatePickers` a named options object and a colocated test

**Complexity: 3/10** — ~25 added lines across 2 production files, 5 requirements and 4 test scenarios (p=4.63); a localized signature change plus one focused colocated test.

## Goal

`web/src/pickers/usePopulatePickers.ts` bundles the two "don't submit" pickers (task and profile) into one hook call. It currently takes eleven positional parameters of overlapping optional-string and callback types and forwards them by position to `useTaskPicker` (seven parameters) and `useProfilePicker` (five), then returns `{ ...task, ...profile }`. Changing or reordering a parameter silently shifts meaning at the single call site, and the merged result has no direct test. Give the hook one named options object, update the one call site, and add a focused test pinning both the forwarding and the merge.

## Approach

Convert the eleven parameters into a single exported `PopulatePickersOptions` type with one named field per current parameter, keeping every field required at the type level exactly as the parameters are today (their value types already allow `undefined` where relevant). Destructure the object inside the hook and forward the same fields, in the same order, to the two delegate hooks, so their own positional signatures and behavior stay unchanged. The single caller, `usePickerOverlays.ts`, passes an object literal instead of the positional list. The merge stays `{ ...task, ...profile }`; a new colocated test pins that both delegates' handlers survive it and that the profile half wins on any key the two happen to share. No user-visible behavior changes.

## Implementation steps

1. In `web/src/pickers/usePopulatePickers.ts`, export `PopulatePickersOptions` with fields `tasks`, `profiles`, `client`, `harnessPtyId`, `dropRef`, `focusHarness`, `pluginCommandLineInsertions`, `profileOwnerLabel`, `profileHarnessPtyId`, `profileReplacements`, `shellLabel`, using the same types the parameters use today. Change `usePopulatePickers` to take one `options: PopulatePickersOptions`, destructure it, and keep the existing two delegate calls and spread return unchanged.
2. In `web/src/pickers/usePickerOverlays.ts`, change the `usePopulatePickers(...)` call to pass a single object literal with the eleven named fields. No other lines in the file change.
3. Run `./scripts/run.mjs check-diff` after each step.

## Tests

- `web/src/pickers/usePopulatePickers.test.ts` (new): mock `useTaskPicker` and `useProfilePicker` so the merge and forwarding can be pinned directly. Cover:
  - the options object is forwarded to each delegate as the correct named values, in the delegates' existing positional order;
  - the merged result keeps both delegates' handlers (a task-only handler and a profile-only handler are present and are the mocks' values);
  - on a key both delegates return, the profile half's value wins.
- `web/src/pickers/useTaskPicker.test.ts` and `web/src/pickers/useProfilePicker.test.ts` must pass unchanged — the delegates are not modified.
- `web/src/pickers/usePickerOverlays.test.tsx` must pass unchanged — it exercises the updated call site.

## Out of scope

- Converting `useTaskPicker` or `useProfilePicker` themselves to options objects; the proposal deliberately leaves their positional signatures in place for now.
- Changing the merge order or the set of keys either delegate returns.
- Any user-visible change to picker behavior, key bindings, commands, or documentation.
