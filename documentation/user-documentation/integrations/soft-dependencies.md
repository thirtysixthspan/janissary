# Soft Dependencies

Janissary works best as part of a broader AI development toolkit. These tools are **soft dependencies** — optional integrations that complement Janissary's functionality. You don't need any of them to use Janissary, but they're natural companions for different parts of your workflow.

## Claude Code

[Claude Code](https://claude.ai/code) is an autonomous AI coding harness — you describe a goal, and it works toward it step-by-step, with tools to read files, edit code, run bash commands, and iterate. It's powerful for complex single-task work where you hand off a goal and come back when it's done.

**How it complements Janissary:**
- **Single vs. multiple agents.** Claude Code runs one task autonomously. Janissary orchestrates multiple agents in parallel, schedules them, and lets them message each other.
- **When to use Claude Code:** Quick autonomous work on an isolated task (a refactor, a spec draft, a single feature). Use Janissary when you need to run that task alongside other work, coordinate results, or run it on a schedule.
- **Integration:** You can spawn a Claude Code tab in Janissary if you want to manage it alongside other work, or use Claude Code standalone for quick isolated tasks.

## Codex

Codex is an AI-assisted code editing experience designed for pair programming — it suggests completions and code changes as you type, helping you write code interactively in your editor. It's focused on the moment-by-moment experience of typing and editing.

**How it complements Janissary:**
- **Interactive vs. autonomous.** Codex is for hands-on, real-time code writing. Janissary is for autonomous agents that work in the background while you do other things.
- **When to use Codex:** When you want an AI pair programmer helping you type interactively. Use Janissary when you want agents running autonomously in parallel, on schedule, or isolated from your main codebase.
- **Integration:** You write code interactively in your editor with Codex's help, then use Janissary agents to run tests, checks, or refactoring in parallel.

## OpenCode

OpenCode is an open-source code generation and editing framework — a flexible foundation for building AI-assisted coding workflows. It provides building blocks for tools that want to support autonomous code editing.

**How it complements Janissary:**
- **Framework vs. application.** OpenCode is infrastructure for building tools. Janissary is a finished application for running multiple agents and managing their work.
- **When to use OpenCode:** If you're building a custom AI coding tool that needs code editing, generation, or agent orchestration capabilities. Use Janissary if you want a ready-made multi-agent development environment.
- **Integration:** An OpenCode-based tool could run as an agent inside Janissary, or Janissary could integrate with an OpenCode-based custom tool via tabs and messaging.

---

## A Typical Workflow

1. **Interactive writing:** Use Codex in your editor for hands-on coding.
2. **Quick focused tasks:** Use Claude Code when you need one agent to work autonomously on an isolated goal.
3. **Parallel work and orchestration:** Use Janissary when you want multiple agents running in parallel, scheduled, or coordinating with each other — without leaving the unified interface.

Each tool does one thing well. Janissary's strength is coordination and parallelization — use it when you need that, and other tools for the parts of your workflow they specialize in.
