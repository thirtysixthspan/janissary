# technical-debt

## ready

## development

* Separate failed file detail reads from automatic redraws so remote recovery can proceed.

Existing Debt: File detail load failures use the same redraw callback as successful loads while leaving their cache entries missing, so completing a failed request immediately starts its replacement. Severity: 5/10

Existing Risk: 7/10 - A remote connection outage can produce an immediate rejection and redraw loop that monopolizes the server event loop and prevents reconnection timers or unrelated tab interactions from progressing.

Proposal Risk: 2/10 - A row can lack details until the next independent refresh, but one failed request cannot schedule an endless chain of replacement requests.

Proposal: In `src/file-navigator/filesystem-cache.ts`, make `fillStats` distinguish a successful cache update from a failed batch: release the failed batch's in-flight markers under the existing generation guard without requesting an immediate rebuild when no visible data changed, and allow the next independently requested refresh to retry the missing rows. `WatchedFilesTabs.rebuild` in `src/file-navigator/watched-tabs.ts` passes a callback that rebuilds again, and `writeRebuiltPayload` in `src/file-navigator/manager/payload.ts` reaches `fillStats` through row construction, creating the current feedback loop. During reconnection, `RemoteChannel.send` in `src/remote/channel/index.ts` answers filesystem requests immediately with an unavailable error, so this is a normal recovery path rather than just a hypothetical faulty port. `src/file-navigator/filesystem-cache.test.ts` covers rejection with inert mock callbacks but does not exercise the production callback shape; add a case whose callback rebuilds the cache, proving a rejected read settles once, and then explicitly trigger another refresh and prove a successful retry updates the row. Retain asynchronous generation protection, synchronous cache behavior, and the contract to retry on the next refresh in `product/specs/file-navigator-tab.md`.


* Complete the profile picker's migration to command bars owned by each tab so a selection replaces the originating bar's draft.

Existing Debt: The profile picker still writes through a global recall ref that no component owns after command bars moved into plugins, while task and queue selections use bridges scoped to each tab. Severity: 5/10

Existing Risk: 5/10 - Choosing a profile from a shell closes the picker without entering the launch command, forcing the user to type it manually and leaving future picker changes dependent on an obsolete ownership path.

Proposal Risk: 2/10 - A command bar can disappear before selection, but its missing registration cannot redirect the chosen command into another tab.

Proposal: Add a replacement registration scoped to each tab alongside caret insertion in `web/src/shared/command-bar/app-command-bar-scope.ts` and expose it additively through `web/src/shared/command-bar/AppCommandBar.tsx`. Own the replacement registry in `web/src/App.tsx`, assemble its registration callback in `web/src/useAppCommandBarState.ts`, and register a shell replacement handler in `web/src/plugins/shell/useApplicationBarEdits.ts` that replaces the draft and focuses that shell's input without submitting, using the existing handler identity cleanup protection. Pass the recorded picker owner through `web/src/pickers/usePickerOverlays.ts` and `web/src/pickers/usePopulatePickers.ts` to `web/src/pickers/useProfilePicker.ts`, and replace the unowned recall ref path in `web/src/pickers/populate-command-line.ts` while preserving harness PTY delivery; if an explicitly recorded owner has closed, do not fall back to the current tab. Remove the unused recall ref and its picker arguments. `web/src/pickers/useProfilePicker.test.ts` supplies an artificial recall callback, and `web/src/pickers/usePickerOverlays.test.tsx` covers task and queue ownership but not profile selection into a real bar; add cases for a current shell, a docked shell, and a closed owner, and extend `web/src/shared/command-bar/app-command-bar-scope.test.ts` and `web/src/plugins/shell/ShellTab.test.tsx` to cover replacement, focus, registration cleanup, and absence of submission. Preserve the selection behavior in `product/specs/profiles.md` and `product/specs/shell-tab.md`.


* Invalidate pending directory reads when a watcher reports a change so older results cannot restore stale rows or details.

Existing Debt: Directory watch invalidation clears completed cache entries without revoking the listing and stat reads already in flight for that directory. Severity: 5/10

Existing Risk: 5/10 - A watch event during a remote read can be overwritten by that read's older result, leaving file names or details stale until another filesystem event or full refresh.

Proposal Risk: 2/10 - Filesystem watchers can still miss events, but reads started before an observed change cannot repopulate the invalidated directory's cache.

Proposal: In `src/file-navigator/filesystem-cache.ts`, extend the validity checks used by `listingFor` and `fillStats` to include a directory revision or request identity that `invalidateDirectory` changes, rather than relying only on the global `cacheGeneration` bumped by `clearFilesystemCache`. Store the necessary state for each directory or request in `src/file-navigator/state.ts` and initialize it in `freshFileNavigatorState`. Invalidation must release the affected pending markers so a fresh read can start, and an older completion must neither cache its result nor remove the replacement read's marker; for stat batches spanning directories, check validity per row so unrelated results remain usable. `WatchedFilesTabs.scheduleRebuild` in `src/file-navigator/watched-tabs.ts` is the watcher caller and should continue invalidating only the changed directory. `src/file-navigator/filesystem-cache.test.ts` covers pending reads across full-cache clears, but directory invalidation cases only use completed data; add deferred listing and cases for stat batches spanning directories where invalidation happens before completion, including both completion orders and rejected older reads. Preserve unrelated directory caches, expanded-state pruning, and the full refresh behavior exercised by `src/file-navigator/pull-refresh.test.ts`.


* Track pending file navigator watches as revocable acquisitions so collapse and root changes cannot install obsolete watchers.

Existing Debt: File navigator watcher ownership begins only after its handle resolves, so an unwatch operation cannot revoke a pending acquisition and the guard for late results does not distinguish roots on the same state object. Severity: 5/10

Existing Risk: 5/10 - Collapsing or changing the root of a remote tree while a watch is pending can install a hidden directory's watcher or let an old root watcher occupy the key intended for the new root.

Proposal Risk: 2/10 - Remote watcher creation can still fail, but a handle arriving after its owning watch request was revoked is stopped instead of attached to the current tree.

Proposal: Add ownership of pending watches keyed by filesystem, root, and relative path in `src/file-navigator/state.ts` and manage it alongside resolved handles in `src/file-navigator/watch.ts`. `watchDir` should reserve an acquisition token before awaiting the port, deduplicate the same current request, and store a resolved handle only if its token and root still match; otherwise stop the late handle. `unwatchDir` must revoke a pending token even when no resolved handle exists. Ensure collapse and root change paths in `src/file-navigator/navigation.ts`, directory pruning in `src/file-navigator/filesystem-cache.ts`, and teardown in `src/file-navigator/manager/profile.ts` use that same revocation lifecycle rather than only deleting resolved handles. `src/file-navigator/watch.test.ts` currently covers replaced state objects and already-claimed keys, but not a collapse or root mutation on the same object; add deferred cases for collapse, duplicate expansion, completion from the old root before and after the new watch, and tab close. Retain synchronous local watches and the navigation and cache pruning behavior covered by `src/file-navigator/navigation.test.ts` and `src/file-navigator/filesystem-cache.test.ts`.


* Use the shared atomic file writer for configuration updates so file permission handling cannot drift between persistence paths.

Existing Debt: Configuration maintains its own implementation of replacement through a temporary file even though the shared atomic writer performs the same operation and preserves existing file permissions. Severity: 4/10

Existing Risk: 4/10 - Updating a theme or remembered setting can replace a deliberately restricted configuration file with permissions derived from the process umask, broadening access to its contents.

Proposal Risk: 2/10 - The shared replacement preserves ordinary permission bits, while filesystem errors and concurrent permission changes by other processes remain possible.

Proposal: Replace the private `writeConfig` implementation in `src/config.ts` with serialization followed by `atomicWriteFile` from `src/atomic-write.ts`, retaining two-space formatting, the trailing newline, unknown key preservation, and updates to the running configuration only after a successful write. The shared helper reads the existing target mode and supplies it when writing the temporary sibling, while the configuration helper currently supplies no mode. Keep `src/config.test.ts` coverage for unknown keys, persistence, failed writes retaining the running setting, and temporary cleanup, and add a permission preservation assertion for an existing configuration file restricted to mode `0600`. Add the corresponding general permission assertion to `src/atomic-write.test.ts`, which currently covers binary writes and failed-replacement cleanup but does not pin mode preservation. Retain the atomic replacement contract in `product/specs/application-config.md`.

## deferred


## declined
