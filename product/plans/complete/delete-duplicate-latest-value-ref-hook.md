# Delete the duplicate latest-value ref hook in web/src

**Complexity: 2/10** — two files with byte-identical bodies collapse into one, a single import in one consumer is repointed, and the surviving hook already has a colocated test. No behavior changes.

## Goal

`web/src/useLatestRef.ts` and `web/src/useLiveRef.ts` define the same hook twice:

```ts
const ref = useRef(value);
ref.current = value;
return ref;
```

Same signature, same return type, two names, two differently worded comments explaining the same thing. Neither is genuinely shared: `useLiveRef` has exactly one consumer (`useAppWindowKeys.ts`), and `useLatestRef` has none outside its own test file. Both sit at the shared flat root of `web/src/`, which is precisely what §2 of [`react-code-organization.md`](../../../ai/guidelines/react-code-organization.md) — colocate; promote to shared only on the second real consumer — exists to prevent.

The cost is small but compounding. An author reaching for a latest-value ref finds two equally blessed options with no signal which one is canonical, so the split perpetuates with each new consumer, and any correctness fix to the pattern has to be applied twice or the two copies silently diverge.

Leave `web/src/` with one latest-value ref hook: `useLatestRef`.

## Approach

`useLatestRef` is the survivor. It is the better-known name for the pattern, it is the one the existing plans in `product/plans/complete/` refer to by name, and it is the one that already carries a colocated test (`useLatestRef.test.ts`) pinning both ref identity across renders and the latest-value update.

`useAppWindowKeys.ts` — the sole consumer of `useLiveRef` — swaps its import and call over to `useLatestRef`. The two hooks are behaviorally identical, so nothing about what `useAppWindowKeys` does changes; only the name at the call site does. Its local variable stays `reference`, and the comment above it mentions a "live-ref snapshot", so that wording is updated to match the surviving hook's name.

`useLiveRef.ts` is then unreferenced and is deleted outright — not re-exported from `useLatestRef.ts`, per §2's "move the file — don't leave a copy behind or re-export it from its old home."

The surviving hook stays at the flat root of `web/src/` rather than being colocated into a feature directory. It now has one consumer, so §2 would argue for colocation, but `useAppWindowKeys.ts` is itself a flat-root app-shell helper split out of `App.tsx`; moving the hook is a separate structural change with its own blast radius and is deliberately not folded into this one.

## Implementation steps

1. Repoint `web/src/useAppWindowKeys.ts` at `useLatestRef`: change the import to `import { useLatestRef } from './useLatestRef';`, change the call to `useLatestRef(deps)`, and update the "live-ref snapshot" wording in the file's leading comment to name the hook it now uses.
2. Delete `web/src/useLiveRef.ts`.

## Tests

`web/src/useLatestRef.test.ts` already covers the surviving hook's two behaviors (initial value; latest value on rerender without a change in ref identity) and stays as-is.

Add `web/src/useAppWindowKeys.test.ts` — the consumer has no colocated test today, and it is the file this change actually edits:

- Passes one and the same ref object to `useWindowKeys` for both the state and the callbacks parameter, which is the property the hook exists to provide.
- Keeps that ref's identity stable across a rerender while its `current` tracks the newest `deps` object, so a mount-once window key listener reads fresh state and handlers.
- Forwards the `client`, `handleScrollKey`, and `handleScrollKeyUp` arguments through to `useWindowKeys` unchanged.

Mock `./useWindowKeys` so the test pins the wiring `useAppWindowKeys` is responsible for without standing up a real window key listener.

## Out of scope

- Moving `useLatestRef.ts` out of the flat root into a feature directory.
- The signature, semantics, or comment of `useLatestRef` itself.
- `useWindowKeys.ts` and everything downstream of it.
- Any other single-consumer module at the `web/src/` flat root.

## Documentation

None. The hook is internal to the web client and changes no user-visible behavior, so nothing `help.md`, the functional specs, or `documentation/user-documentation/` describes is now different.
