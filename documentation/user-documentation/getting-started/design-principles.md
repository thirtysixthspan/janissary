# Design principles

<img class="agent-float" src="/agents/aslan-south-west.png" alt="" />

Janissary is built around a small set of tenets. They explain why the app looks the way it does, and why some things it deliberately doesn't do.

## Workflow support

Janissary supports the work you're already doing rather than prescribing a workflow of its own. A tab can be a [shell](/user-documentation/command-bar/shell#open-a-shell-tab), an [editor](/user-documentation/tab-types/editor), or a [harness](/user-documentation/advanced-agents/harness). An autonomous `agent` task runs from a command bar and returns a result there; add `in a tab` if you want a monitor tab to follow its activity. Mix these tools freely, whether you're developing code, writing, or managing something else entirely. [Profiles](/user-documentation/automation/profiles) let you capture a multi-tab setup and recreate it with one command.

## Integrated agents

<img class="agent-float left" src="/agents/bilal-south-east.png" alt="" />

You can launch an autonomous task from a shell tab's command bar without giving up the shell. The task runs independently and returns its status and response there. Add `in a tab` to open a monitor for its activity; the monitor has no command bar or terminal. A harness tab works differently: its full-terminal view takes the place of the app command bar and transcript, so you type directly into the harness. Shell tabs keep both a terminal and their own command bar. By default they also save terminal text to a separate transcript file; a project's `recordShellTabs` setting turns off both recordings and transcripts.

## Agent orchestration

You can run autonomous tasks from different command bars and follow the ones you choose in monitor tabs. For interactive work, open multiple [harness tabs](/user-documentation/advanced-agents/harness) and coordinate through the tools available in those harnesses. [Scheduling](/user-documentation/automation/scheduling) runs commands in eligible tabs later.

## This is an application, not a platform

Janissary is a user interface that runs on one system and controls work done on that system or others. It doesn't depend on a separate backend service to function — there's no server to deploy or account to create. [Starting the app](/user-documentation/getting-started/startup) is the whole setup.

## Keyboard first, mouse augmented

Opening tabs and running app commands are available from a shell tab's [command bar](/user-documentation/command-bar/commands); harness tabs take input in their terminal instead. [Keyboard shortcuts](/user-documentation/getting-started/keyboard) and the tab strip let you switch between tabs without reaching for the mouse.

## Identical control of local and remote resources

Where your compute lives shouldn't change how you work. An [ssh tab](/user-documentation/advanced-agents/harness) reaches a remote host through the same tab model as a local shell, and a [workspaced tab](/user-documentation/advanced-agents/workspaced-agent) gets an isolated clone of your repository whether that clone lives on your machine or elsewhere.

## Revision control of assets

Janissary doesn't invent its own versioning scheme. It leans on the tools that already do this well: local revision control through git, and distributed collaboration through GitHub — the same tooling a [workspaced tab](/user-documentation/advanced-agents/workspaced-agent) uses to isolate and later reconcile its changes.

## Traceability of work

Complex systems fail in complex ways, and Janissary doesn't pretend otherwise. Shell tabs keep a separate text-transcript file, and harness sessions can be reviewed through their session transcript. The connections panel (see [Harness tabs](/user-documentation/advanced-agents/harness)) shows what's running underneath a terminal tab, while [command history](/user-documentation/command-bar/history) helps you find commands you ran from a command bar.
