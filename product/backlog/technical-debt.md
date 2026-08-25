# technical-debt

## ready

* Finish gathering the editor feature into `web/src/editor/`: `web/src/EditorTab.tsx` — the feature's top-level component, whose import block is eighteen `./editor/…` lines — sits in the flat `web/src/` root next to `EditorTab.test.tsx` and the editor-only `OverwriteConflictDialog.tsx` and its test, which `EditorTab.tsx:191` is the only render site for, while the feature's other fifty-nine files live under `web/src/editor/`. That is §1 (organize by feature, not by file type): the directory named for the feature does not contain the feature's entry point, so its edge is invisible and every new editor file has to guess which side of the line it belongs on. Move all four files into `web/src/editor/`, flip the eighteen `./editor/…` imports to `./`, and repoint the thirteen other root files that import `./EditorTab` — `App.tsx`, `AppMain.tsx`, `AppShell.tsx`, `Sidebar.tsx`, `MountedViewLayers.tsx`, `CloseSaveGuard.tsx`, `dirtyTabs.ts`, `useUnsavedQuitGuard.ts`, and their tests — at `./editor/EditorTab`. It is all import-path churn with no behavior change; sequence it after the drop-handle entry above, which also rewrites `EditorTab.tsx`'s import block. Severity: **medium**.

* Delete one of the two identical latest-value ref hooks: `web/src/useLatestRef.ts` and `web/src/useLiveRef.ts` have byte-identical bodies — `const ref = useRef(value); ref.current = value; return ref;` — under two names and two differently worded comments, and neither is actually shared: `useLiveRef` has exactly one consumer (`useAppWindowKeys.ts:14`) and `useLatestRef` has none at all outside its own test. Both sit at the shared flat root, which is what §2 (colocate; promote to shared only on the second real consumer) exists to prevent — a shared layer filling with single-consumer code nobody dares change. The cost is small but compounding: an author needing a latest-value ref finds two equally blessed options with no signal which is canonical, so the split perpetuates, and any correctness fix to the pattern has to be made twice or the two silently diverge. Keep `useLatestRef.ts` and its test, point `useAppWindowKeys.ts` at it, and delete `useLiveRef.ts`. One production file changes. Severity: **low**.

## development

## deferred

## declined
