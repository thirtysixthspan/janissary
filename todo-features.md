
## scrolling
mouse scroll wheel to scroll back the tab transcript not the command history
assure that the up arrow continues to scroll through the command history


## embedded ai harness
create a new command called harness.
called: harness harnessname 
where harnessname is [claude, opencode, codex] 
calling the harness should take over the tab and allow the harness to render within the tab.
tab switching should still be supported
upon closing the harness, the cli in the terminal should be restored

## Tab group indicator
agents have a group number.
group numbers begin at 1 and increase.
when an agent is created, the new agent inherits the group number of the agent creating the new agent.
the group is conveyed by a solid colored bar running along the top edge of the tab.
Placement: a horizontal accent sits flush against the top of each tab — implemented as a border-top (or an equivalent inset top bar), spanning the tab's full width.
Thickness: 6px.
All tabs in the same group use the same group color.
different groups use different colors. 
Full strength regardless of state. The group bar is rendered at full opacity on every tab — active and inactive. Do not fade, lighten, or reduce the opacity of the bar on background/unselected tabs