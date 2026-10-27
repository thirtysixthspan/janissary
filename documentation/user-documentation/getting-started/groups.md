# Tab groups

<img class="agent-float" src="/agents/fariz-south.png" alt="" />

Related tabs stay together as a group, drawn as a colored band along the top of every member tab. The band is the same color and full strength on every member, active or not, so a group reads as one connected run in the strip.

![The tab strip showing two groups: the root group's tabs share one top-border color, and a second group of tabs shows a distinctly colored band.](/screenshots/tabs-groups.png)

Each group has a name and a number. The `janus` tab starts in the `launch` group, number `1`. Most tabs inherit the group of the tab that opened them, and you can also choose a group when you launch a shell or harness:

- **The root group.** The `janus` shell tab every launch opens founds the `launch` group, number `1`, colored after its own dot.
- **New tabs join their creator's group.** A tab made with `shell` (or by opening a file or page) joins the group of the tab you ran the command from. Creation is transitive: a chain of agents spawned from one another all share one group.
- **Choose a group for a shell or harness.** Add `in group <name|id>` to its launch command. Names match without regard to case. A name that isn't in use creates a new group with the next available number; a new positive number creates that numbered group. A numbered group without a supplied name is called `group-<id>`. For example, `shell in group review` and `harness claude in group review` join the same group.
- **Move an open tab.** Use `tab group <tab> <id|name>` to move a tab into a group. An unknown name creates the next available group; an unknown positive number creates that numbered group. The tab joins after the group's last member and keeps its pane or sidebar placement.
- **Profiles get their own group.** `profile launch` places all of a profile's tabs into one new group, so a launched profile reads as its own band in the strip — see [Profiles](/user-documentation/automation/profiles).

A group's band color is fixed when the group is created (the color of its first member) and never shifts afterward, even as tabs are reordered or closed. Profiles saved with group names keep those names when you launch them again; older profiles use `group-<id>` for groups without a saved name.

In the center strip, groups stay contiguous. A new center tab is inserted directly after the last tab of its group, and reordering with `Ctrl+←` / `Ctrl+→` or dragging a center tab stays within its group. `tab move <tab> <position>` uses a 1-based position among center tabs in the same group and pane. A visible docked tab instead moves among all tabs on its sidebar, regardless of group; a hidden tab keeps its center group-and-pane order even while docked. A position past the end puts the tab last. These commands leave your current tab focused.
