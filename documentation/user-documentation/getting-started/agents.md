# Agents

An agent is what lives in an ordinary tab: a transcript, a command bar, a persistent shell, and a name other tabs can address. The `agent` command creates them.

```
agent                              new workspaced agent, random unused name
agent bilal                        new workspaced agent named "bilal"
agent bilal --no-workspace         new agent in the project checkout
```

The new tab is focused as soon as it's created. See [Tabs](/user-documentation/getting-started/tabs) for how agent tabs behave in the strip — dot colors, the busy blink, unread badges, renaming, and closing.

## Names

<img class="agent-float" src="/agents/bilal-south-west.png" alt="" />

Agent names are always lowercased, and `bilal` and `BILAL` are the same name. Otherwise a name you type is taken as given, so `agent 10.27.1.94` is a perfectly good name and keeps its history and transcript across a relaunch. The name still has to be free before the tab opens: when it isn't, no tab opens, nothing is written to the tab you typed the command in, and one line lands in the [notifications](/user-documentation/tab-types/notifications) feed instead.

A name is taken when:

- an open tab has it, on any host;
- the [sessions](/user-documentation/tab-types/sessions) tab has a harness or agent row with it that is still `provisioning`, `active`, `reconnecting`, or `detached`, on any host;
- for `agent <name> on <host>`, something with that name is already running on that host;
- for a workspaced launch, a live Janissary still owns the workspace folder of that name: an open tab using it, or a Janissary instance running inside it. A plain shell sitting in the folder does not count.

The line says which one it hit:

```
Cannot launch "bilal": a tab named "bilal" is already open.
Cannot launch "bilal": "bilal" is already in the sessions tab (detached on devbox).
Cannot launch "bilal": "bilal" is already running (/Users/ada/.janissary/workspace/bilal).
```

Bare `agent` draws a random unused name from a preset pool of 52 lowercase names: ahmed, akbar, aslan, basir, bekir, bilal, cafer, cahit, cavus, davud, demir, dogan, ekrem, emrah, ersin, farid, fariz, fikri, hakim, hamza, harun, idris, ilyas, imran, jabir, jalal, jamal, kadir, kamil, kasim, latif, lutfi, mahir, malik, murad, omair, orhan, osman, rasim, recep, rifat, sabri, salih, selim, tahir, timur, turan, yahya, yavuz, yusuf. It skips every taken name in silence, and when all 52 are in use, `All agent names are in use.` goes to the notifications feed and no tab opens.

<img class="agent-float left" src="/agents/malik-south-east.png" alt="" />

A workspace folder left over from an earlier run is the one case that clears its own way. If nothing is running in it, it is removed before the clone starts, uncommitted work and all, and the removal is announced as `Removed leftover workspace "bilal" (<path>) before launching.` A folder that can't be removed refuses the launch instead of proceeding. See [Workspaced agents](/user-documentation/advanced-agents/workspaced-agent) for where that folder lives and how long it lasts.

On a remote host the answer arrives after the placeholder tab is already open, and a name that host reports as running is refused in a different way. See [Remote agents](/user-documentation/advanced-agents/remote-agents#when-the-name-is-already-in-use).

## Workspaced agents

Agents get their own disposable clone by default, isolated from the rest of your machine. `--workspace` (or `-w`) explicitly confirms that choice; `--no-workspace` starts in the project checkout instead. If you provide both, `--no-workspace` wins. Workspaces change enough — where the clone lives, what the isolation blocks, how GitHub authentication works — that they have their own page: see [Workspaced agents](/user-documentation/advanced-agents/workspaced-agent).
