# Give plugin remote filesystem ports a tab-owned lifetime

**Complexity: 7/10** — the change ties remote capability ports to their invoking tab and remote channel across capability acquisition, tab close, host shutdown, and asynchronous file materialization. It uses existing port disposal and remote-cache cleanup behavior rather than adding a new resource framework.

## Goal

- Reuse one remote filesystem port while its plugin tab and channel remain live.
- Dispose the port and forget its cache records when the owning tab closes, without ending a channel still used by other tabs.
- Release all remaining plugin ports before remote channels shut down.
- Prevent an in-flight file read from materializing or registering cache data after its tab has closed or changed channels.

## Approach

1. Replace the label-only port map in `src/plugins/remote-capabilities.ts` with per-tab resource records containing the channel, port, and live state. Resolve the tab before acquisition, reuse only while that tab still rides the same channel, and provide idempotent release for one label and for all records.
2. Release the tab's plugin remote resource from `closeTabResources()` before the ordinary remote-manager release, and release remaining resources from `TabPluginHost.dispose()`, which runs before `RemoteManager.dispose()`.
3. After `readFile()` resolves, confirm the same resource remains live and the tab still resolves to the same channel before calling `materializeRemoteFile()`. A stale completion answers `null` and registers no cache record.
4. Keep existing remote navigator disposal and orphaned-save behavior unchanged.

## Tests

- `src/plugins/context.test.ts`: repeated calls share a port; closing one plugin tab disposes only its port while the remote channel survives; reusing the label on another channel creates a new port; a read resolving after close does not create a cache file or record; host shutdown releases any remaining plugin ports.
- `src/tab/cleanup.test.ts` or focused plugin lifecycle coverage: tab cleanup invokes plugin-port release.
- Keep `src/file-navigator/remote/port.test.ts` and `src/file-navigator/remote/file-cache.test.ts` passing to pin ordinary disposal and orphaned-save behavior.

## Spec and documentation

- Update `product/specs/tab-plugins.md` to state that plugin remote filesystem resources live for the tab and are released on tab close or host shutdown, and that a late read cannot create a write-back cache record.
- No `help.md` or user-documentation behavior currently describes this internal lifecycle.

## Out of scope

- Changing remote channel ownership or the ordinary file-navigator port lifecycle.
- Changing cache identity, save behavior, or remote transport failure handling.
