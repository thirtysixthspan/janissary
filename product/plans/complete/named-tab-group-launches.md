# Launch shell and harness tabs into named groups

**Complexity: 7/10** — tab groups currently have numeric IDs and colors but no names. Adding name lookup and explicit placement crosses shell and harness launch parsing, tab creation, profile persistence, and the server-owned tab view.

## Goal

Allow `shell` and `harness` launches to select a tab group with `in group <name|id>`. Every group has a stable name and positive numeric ID. The initial `launch` group is ID 1, and a launch that names a new group creates it.

## Approach

Keep group identity on each server-owned tab alongside its existing numeric ID and color. Add one tab-group resolver that finds an existing group by case-insensitive name or ID, creates a group for an unknown name or ID, and supplies a generated `group-<id>` name for groups without an authored name. The default tab carries the name `launch` and ID 1. Carry names through the wire view and profile save/restore so the server and clients continue to describe the same group.

Shell and harness parsers will recognize `in group <name|id>` as a launch clause. The shell plugin passes the selection through its existing host launch capability; the host resolves the group and places the tab there. HarnessManager resolves the same selector before spawning its tab. A launch with no selector keeps inheriting its creator's group.

## Implementation steps

1. Add tab-group identity and a resolver for existing groups, new names, and numeric IDs; initialize the default tab as `launch` (ID 1) and ensure ordinary inherited tabs retain their group's name.
2. Parse `in group <name|id>` in shell and harness launch arguments, reject a missing selector with a usage error, and pass the parsed selection to the host launch or harness spawn path.
3. Carry group names through tab views and profile serialization/restoration, assigning generated names to legacy profile groups that contain only IDs.
4. Add parser, resolver, launch-placement, and profile round-trip tests. Update `product/specs/tabs.md`, `product/specs/shell-tab.md`, `product/specs/harness.md`, and `product/specs/profiles.md`; update `help.md` and existing user documentation only where they already describe these launch commands and profile presentation.
5. Remove the matching issue and promote this plan to `complete/` after implementation and verification.

## Tests

- Tab-group resolver tests cover default group identity, case-insensitive name lookup, ID lookup, creation of new named groups, generated names for numeric-only groups, and allocation of the next available ID.
- Shell argument tests cover `in group <name>`, `in group <id>`, and a missing selector.
- Harness command tests cover the same clause while preserving existing flags, `as`, `on`, and `with` behavior.
- Launch tests verify shell and harness tabs join the selected group and inherit its group color, while launches without a selector keep inheriting the creator group.
- Profile save/restore tests verify group names survive and legacy numeric groups receive a deterministic generated name.

## Out of scope

- Renaming, merging, or deleting groups after launch.
- Adding a group-management interface or changing how groups are rendered.
- Changing group ordering, tab reordering, profile group allocation, or group colors.
