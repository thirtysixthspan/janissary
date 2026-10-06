# Give each clipboard-history plugin its own store

**Complexity: 8/10** — replace module-global history with an instance-owned service, connect its lifecycle to a plugin factory, and adapt its snapshots through a React hook and container. The visible history behavior stays the same.

## Goal

Make clipboard history, selection, configuration, subscribers, and clipboard-capture teardown belong to one plugin instance. Disposing one instance must not clear or unsubscribe another.

## Approach

Turn the store into `createClipboardHistoryStore`, a framework-free factory that receives the clipboard-copy subscription function and returns stable snapshot getters, a subscription method, history actions, `start`, and idempotent `dispose`. Keep per-instance snapshot caching, cap fallback, ordering, deduplication, and selection rules.

Add `useClipboardHistory(store)` using `useSyncExternalStore`, a small `ClipboardHistoryView` that connects the hook to the popup, and make `ClipboardHistoryPopup` accept rows, selected index, and choose callback as props while keeping its focus effect. Add `createClipboardHistoryPlugin(store)` so every plugin module instance closes over its own store in `start`, key handling, opening, rendering, and disposal; keep the default module export as one factory-created instance and subscribe to clipboard copies only when `start` runs.

## Implementation steps

1. Replace the store's module-level state with the instance factory and update `store.test.ts` to create fresh stores per test.
2. Add the hook and container, make the popup presentational, and update popup tests to pass rows and selection through props. Add hook subscription and stable-snapshot coverage.
3. Add the plugin factory, wire all overlay callbacks and lifecycle methods to its store, and update module and paste-routing tests to use independent plugin instances.
4. Add an isolation test showing that disposing one started instance leaves another instance's history and clipboard subscription working.

## Tests

- Preserve coverage for ordering, deduplication, whitespace rejection, cap changes, selection clamping, full-text pasting, focus, keyboard behavior, anchor routing, and single-close behavior.
- Verify separate stores have independent rows and selection, injected subscriptions start only on activation, and disposal is idempotent and only removes that instance's subscription.
- Verify the hook observes row and selection changes while reusing snapshots until the store changes.
- Run `./scripts/run.mjs check-diff` after every change.

## Spec and documentation

No user-visible behavior changes. The clipboard-history spec already describes the window lifetime, cap, ordering, popup, and paste behavior; no public documentation change is needed.

## Out of scope

- Changing the overlay-plugin host contract or activation declaration.
- Changing clipboard capture itself or the shared capture seam.
- Changing clipboard history's visible behavior, cap rules, or persistence lifetime.
