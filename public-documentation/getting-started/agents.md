# Agents

An agent is what lives in an ordinary tab: a transcript, a command bar, a persistent shell, and a name other tabs can address. The `agent` command creates them.

```
agent                     new agent, random unused name
agent bilal               new agent named "bilal"
agent bilal --workspace   new agent with a disposable clone of the repo
```

The new tab is focused as soon as it's created. See [Tabs](/getting-started/tabs) for how agent tabs behave in the strip — dot colors, the busy blink, unread badges, renaming, and closing.

## Names

<img class="agent-float left" src="/agents/malik-south-east.png" alt="" />

Agent names are always lowercased and must be unique among open tabs — `agent bilal` while a `bilal` tab exists prints `Agent "<name>" is already active.` and creates nothing.

Bare `agent` draws a random unused name from a preset pool of 52 lowercase names: ahmed, akbar, aslan, basir, bekir, bilal, cafer, cahit, cavus, davud, demir, dogan, ekrem, emrah, ersin, farid, fariz, fikri, hakim, hamza, harun, idris, ilyas, imran, jabir, jalal, jamal, kadir, kamil, kasim, latif, lutfi, mahir, malik, murad, omair, orhan, osman, rasim, recep, rifat, sabri, salih, selim, tahir, timur, turan, yahya, yavuz, yusuf. When all 52 are in use, bare `agent` prints `All agent names are in use.` — name one explicitly instead.

## Workspaced agents

<img class="agent-float" src="/agents/hakim-south.png" alt="" />

`agent <name> --workspace` (or `-w`) gives the agent its own disposable clone of your repository instead of working in the project directly, isolated from the rest of your machine. That changes enough — where the clone lives, what the isolation blocks, how GitHub authentication works — that it has its own page: see [Workspaced agents](/advanced-agents/workspaced-agent).
