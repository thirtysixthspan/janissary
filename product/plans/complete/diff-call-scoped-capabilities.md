# Thread each call's own capabilities through the diff plugin

**Complexity: 4/10** — a signature change confined to the diff plugin's session and tab classes, plus one contract comment and tests; no host, protocol, or client change.

## Goal

A diff opened or clicked from one tab always acts through the capabilities of the call that asked, so it never acts through a tab that has since closed. After the tab that first ran `diff` closes, `diff` from any other tab still opens or focuses the diff tab, and opening a file from a remote diff row fetches it through the diff tab's own channel.

## Approach

The host builds a fresh `TabPluginServerCapabilities` for every guarded call and binds it to that call's origin and answering tab. `openOrFocusTab` refuses to act once the origin is gone and no answering tab exists, and the remote capabilities pick their channel from the answering label first and the origin second. The diff plugin keeps the first caller's object for its whole life, so both behaviors break.

Follow the split `SearchSession` already documents. The object a `DiffSession` is built with is kept only for what needs no origin tab: `readSettings`, `saveSettings`, and `updateTab` (publishing by instance key). Narrow its type to `Pick<TabPluginServerCapabilities, 'readSettings' | 'saveSettings' | 'updateTab'>` so the compiler enforces the rule, and narrow the object a `DiffTab` keeps to `Pick<…, 'updateTab'>` for the same reason. Every method that acts for a tab takes the handler's own capabilities and hands them on.

## Implementation steps

1. `src/plugins/api.ts`: add a comment above `TabPluginServerCapabilities` saying the object is valid only for the call that received it, so a plugin keeps only what needs no origin tab and acts through each call's own object.
2. `src/plugins/diff/tab-state.ts`: narrow the stored capabilities to `updateTab`; take a `capabilities` argument on `open`, `setFullFile`, `openFile`, and `openMedia`, and use it for `openOrFocusTab`, `rejectRequest`, `openInEditor`, `materializeRemoteFile`, `dispatchLineWithOutput`, and the recompute's read.
3. `src/plugins/diff/session.ts`: narrow the constructor object to the settings and publishing capabilities; take a `capabilities` argument on `open`, `openWorkspace`, `openRemoteWorkspace`, `setFullFile`, `openFile`, and `openMedia` and pass it into the matching `DiffTab` method; have `openRemoteWorkspace` call `openOrFocusTab` and `launchTab` on it; have the launch-ready callback refresh with its own second argument.
4. `src/plugins/diff/activate.ts`: pass each handler's own `capabilities` into the session methods, including through `openWorkspace`.

## Tests

- `src/plugins/diff/activate.test.ts`:
  - Running `command('')` with fake A and then again with fake B calls B's `openOrFocusTab` on the second run.
  - Opening a file from a diff tab opened by fake A, with the `open` intent arriving on fake B, calls B's `openInEditor` and not A's.
  - The launch-ready callback of a remote workspace refreshes through the capabilities it receives, not the ones that launched the tab: its read goes to the ready object's `readWorkspaceChangeSet`.
- `src/plugins/diff/session-context.test.ts` and `src/plugins/diff/tab-state.test.ts`: update to the new signatures.

## Out of scope

- Any change to the host's capability construction or to `openOrFocusTab`'s refusal of a closed origin.
- Auditing other plugins for session-scoped capability objects; only a doc comment states the lifetime rule.
- Pruning `DiffSession.tabs` when its tabs close (a separate backlog item).
