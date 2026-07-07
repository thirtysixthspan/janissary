# Design principles

<img class="agent-float" src="/agents/hakim-south.png" alt="" />

Janissary is built around a small set of tenets. They explain why the app looks the way it does, and why some things it deliberately doesn't do.

## Workflow support

Janissary supports the work you're already doing rather than prescribing a workflow of its own. A tab can be a shell, an [agent](/getting-started/agents), an [editor](/tab-types/editor), or a [harness](/advanced-agents/harness) — mix and match freely, whether you're developing code, writing, or managing something else entirely. [Profiles](/automation/profiles) let you capture whatever multi-tab setup fits your work and recreate it with one command.

## Integrated agents

Agents aren't a separate mode bolted onto a terminal — they're tabs like any other, sharing the same command bar, [tab-completion](/command-bar/tab-completion), and [history](/command-bar/history) as your shell tabs. You work alongside them in the same interface you already use.

## Agent orchestration

Beyond working *with* an agent, Janissary lets you direct many of them at once: run multiple agents in parallel across tabs, have them message each other to coordinate (see [Harness tabs](/advanced-agents/harness)), and use [scheduling](/automation/scheduling) to run agents automatically without you present.

## This is an application, not a platform

Janissary is a user interface that runs on one system and controls work done on that system or others. It doesn't depend on a separate backend service to function — there's no server to deploy or account to create. [Starting the app](/getting-started/startup) is the whole setup.

## Keyboard first, mouse augmented

Every core action — opening tabs, running commands, switching between them — is reachable from the [command bar](/command-bar/commands) and [keyboard shortcuts](/getting-started/keyboard). The mouse is welcome, but nothing important requires it.

## Identical control of local and remote resources

Where your compute lives shouldn't change how you work. An [ssh tab](/advanced-agents/harness) reaches a remote host through the same tab model as a local shell, and a [workspaced agent](/advanced-agents/workspaced-agent) gets an isolated clone of your repository whether that clone lives on your machine or elsewhere.

## Revision control of assets

Janissary doesn't invent its own versioning scheme. It leans on the tools that already do this well: local revision control through git, and distributed collaboration through GitHub — the same tooling a [workspaced agent](/advanced-agents/workspaced-agent) uses to isolate and later reconcile its changes.

## Traceability of work

Complex systems fail in complex ways, and Janissary doesn't pretend otherwise. Every tab keeps its own transcript, the connections panel (see [Harness tabs](/advanced-agents/harness)) shows what's running underneath it, and [command history](/command-bar/history) records what was run and when — so when something goes sideways, you can unravel it.
