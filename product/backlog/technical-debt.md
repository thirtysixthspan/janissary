# technical-debt

## ready

* Delete one of the two identical latest-value ref hooks: `web/src/useLatestRef.ts` and `web/src/useLiveRef.ts` have byte-identical bodies — `const ref = useRef(value); ref.current = value; return ref;` — under two names and two differently worded comments, and neither is actually shared: `useLiveRef` has exactly one consumer (`useAppWindowKeys.ts:14`) and `useLatestRef` has none at all outside its own test. Both sit at the shared flat root, which is what §2 (colocate; promote to shared only on the second real consumer) exists to prevent — a shared layer filling with single-consumer code nobody dares change. The cost is small but compounding: an author needing a latest-value ref finds two equally blessed options with no signal which is canonical, so the split perpetuates, and any correctness fix to the pattern has to be made twice or the two silently diverge. Keep `useLatestRef.ts` and its test, point `useAppWindowKeys.ts` at it, and delete `useLiveRef.ts`. One production file changes. Severity: **low**.

## development

## deferred

## declined
