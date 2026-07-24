# Why Janissary

Janissary solves a problem that existing tools were never designed to solve: **managing multiple autonomous AI agents in parallel, with scheduling and messaging, all from one unified interface**.

To understand what makes Janissary different, it helps to understand the categories of tools that currently exist—and what gap Janissary fills.

## The Tool Landscape

### AI Code Editors
**Examples:** Cursor, Windsurf, GitHub Copilot

These are IDEs with AI built in. They excel at interactive code editing and pair programming: you type a task, the AI completes code in your editor, you review and iterate. They integrate deeply with your editor but focus on a single developer workflow at a time.

**Best for:** Writing code interactively, getting completions and suggestions as you type.  
**Limitation:** Not designed for parallel work across multiple agents or non-coding tasks.

### Single-Agent Harnesses
**Examples:** Claude Code, Pi Agent, Aider

A "harness" wraps an AI model in a terminal, giving it tools to read files, edit code, run bash commands, and see results. Harnesses are autonomous—you describe a goal, the AI works toward it step-by-step. They're powerful for complex tasks but designed for one agent working on one goal.

**Best for:** Handing off a task to an AI and letting it work autonomously.  
**Limitation:** No built-in way to run multiple agents in parallel, schedule them, or have them coordinate.

### Traditional Terminal Multiplexers
**Examples:** tmux, Zellij, screen

These split your terminal into panes, each running an independent shell. They're fundamental to server work and local development. But they're generic—they don't understand AI agents, don't track their state, don't help them coordinate.

**Best for:** Running multiple independent shell sessions side by side.  
**Limitation:** No agent awareness, no scheduling, no inter-agent messaging.

### AI-Focused Terminal Multiplexers
**Examples:** Herdr, Termdock, Mato

Recent tools that combine multiplexing with agent awareness. They show which agents are busy, blocked, or idle, and let you see multiple agents working at once. This is a real improvement over generic multiplexers, but these tools are still fundamentally panes in a terminal.

**Best for:** Visualizing the state of multiple AI agents working in parallel.  
**Limitation:** Terminal-based, no scheduling, no messaging between agents, limited ability to manage non-agent workflows.

### Agent Orchestration Platforms
**Examples:** CrewAI, LangGraph, n8n

These are frameworks for defining workflows where multiple specialized agents work together toward a goal. You code up roles, tasks, and handoffs, and the framework runs them. Powerful for backend workflows and batch processing.

**Best for:** Building complex multi-agent systems as code.  
**Limitation:** Require backend deployment, not optimized for developer workflows, steep learning curve.

---

## The Gap: Developer-First Multi-Agent Orchestration

All of these categories solve real problems. But they all miss something:

**You want to run multiple AI agents in parallel, interactively, with the ability to schedule them, have them message each other, and manage isolated workspaces—without leaving a unified interface.**

That's the gap Janissary fills.

<img class="agent-float" src="/agents/dogan-south-east.png" alt="" />

You might:
- Run an agent that writes tests while another refactors a module
- Schedule an agent to run checks every morning and message you with results
- Spawn a workspaced clone of your repo so an experimental agent can explore without touching your main directory
- Define a profile that recreates your favorite multi-tab setup with one command
- Message agents across tabs to coordinate handoffs

These workflows are impossible (or painful) in existing tools. Herdr can show you multiple agents, but can't schedule them or let them message each other. Claude Code can do autonomous work, but only one task at a time. CrewAI can orchestrate agents, but it's a backend framework, not a developer tool.

Janissary is built from the ground up for this: **tab-based, developer-first, with scheduling, messaging, profiles, and workspaced agents baked in.**

---

<img class="agent-float left" src="/agents/ekrem-south-west.png" alt="" />
## Who Is This For?

### You're a good fit if you:

- **Work on complex codebases** where you'd benefit from parallelizing multiple autonomous coding tasks (refactoring one module while an agent writes tests for another)
- **Use AI agents regularly** and find yourself opening multiple terminals, tmux panes, or tabs to manage them
- **Need to automate recurring tasks** like nightly runs, testing pipelines, or deployment checks—and want them to run in predictable, isolated environments
- **Collaborate with agents** in ways that require them to coordinate: handing off work, messaging results, running in sequence
- **Value reproducibility** and want to save multi-agent setups as profiles so you can spin up the same workflow again with one command
- **Want a better UI** than tmux or bare terminals for understanding what your agents are doing at a glance

### You might not need Janissary if you:

- Mostly write code interactively with your IDE—Cursor or Copilot are better fits
- Only ever run one autonomous agent at a time—Claude Code or Pi Agent are simpler
- Need to deploy multi-agent systems to production—CrewAI or LangGraph are the right foundation
- Primarily work remotely on servers—tmux is universally available and battle-tested

---

## How Janissary Fits Into Your Workflow

Think of Janissary as the **control center for your AI agents**. It's not a replacement for your code editor, your AI harness, or your shell—it's the place you open when you want to:

1. **Spawn multiple agents** at once and watch them work side by side
2. **Schedule automated tasks** that run without you (with messaging so you stay informed)
3. **Isolate experimental work** in disposable workspaced clones
4. **Define reproducible setups** as profiles so your team (or your future self) can recreate them instantly
5. **Coordinate agents** through messaging and handoffs

You'll still use your editor for interactive coding. You might still open Claude Code or Cursor for quick tasks. But when you need orchestration, parallelization, and workflow automation, Janissary is where you do it.

---

## Key Innovations

### Tabs as Units of Work
Instead of panes, Janissary uses tabs. Each tab is independent—a long build in one tab doesn't block conversation in another. The tab strip shows at a glance which agents are busy (🔴), idle (🟢), or need attention.

### Scheduling as a First-Class Feature
Run commands at specific times, with Janissary managing the timing and persistence. No need for external tools like cron or systemd. If your laptop sleeps, Janissary wakes up and catches up.

### Inter-Agent Messaging
Agents can message each other across tabs. One agent can wait for another to finish, then run based on the results. This enables complex workflows without leaving Janissary.

### Profiles for Reproducibility
Define a multi-tab setup once, save it as a profile, and recreate it anytime. Perfect for team workflows or personal habits.

### Workspaced Agents
Spawn an agent in an isolated git clone of your repo. If it breaks things, your main directory is untouched. When you're done, the clone disappears.

---

## Next Steps

- [Design principles](/user-documentation/getting-started/design-principles) — The tenets behind how Janissary is built
- [Starting the app](/user-documentation/getting-started/startup) — Get Janissary running
- [Tabs](/user-documentation/getting-started/tabs) — Understand how tabs work
- [Agents](/user-documentation/getting-started/agents) — Spawn and manage AI agents
- [Scheduling](/user-documentation/automation/scheduling) — Automate tasks with built-in timing
- [Profiles](/user-documentation/automation/profiles) — Save and recreate multi-tab setups
