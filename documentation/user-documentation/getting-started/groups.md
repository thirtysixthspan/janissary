# Tab groups

Related tabs stay together as a group, drawn as a colored band along the top of every member tab. The band is the same color and full strength on every member, active or not, so a group reads as one connected run in the strip.

![The tab strip showing two groups: the root group's tabs share one top-border color, and a second group of tabs shows a distinctly colored band.](/screenshots/tabs-groups.png)

You don't manage groups directly — they follow from how tabs are created:

- **The root group.** The startup `janus` tab founds the first group, colored after its own dot.
- **New tabs join their creator's group.** A tab made with `agent` (or by opening a file or page) joins the group of the tab you ran the command from. Creation is transitive: a chain of agents spawned from one another all share one group.
- **Profiles get their own group.** `profile launch` places all of a profile's tabs into one new group, so a launched profile reads as its own band in the strip — see [Profiles](/user-documentation/automation/profiles).

A group's band color is fixed when the group is created (the color of its first member) and never shifts afterward, even as tabs are reordered or closed.

<img class="agent-float" src="/agents/demir-south-east.png" alt="" />
<img class="agent-float left" src="/agents/dogan-south-west.png" alt="" />

Groups also stay contiguous. A new tab is inserted directly after the last tab of its group, and reordering with `Ctrl+←` / `Ctrl+→` only swaps a tab with a neighbor in the same group — you can rearrange within a band, but never drag a tab out of it.

Groups persist: on `janus --relaunch`, every restored tab keeps its group and band color, so the strip comes back exactly as you left it.
