# technical-debt

## ready

## development

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
