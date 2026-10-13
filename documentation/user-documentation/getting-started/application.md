# What is Janissary?

<img class="agent-float" src="/agents/yusuf-south.png" alt="" />

Janissary is an **Agentic Working Environment**: an app for directing AI agents rather than typing every command yourself. You can work in a shell tab, run an AI coding harness in its own terminal tab, or give `agent` an autonomous task to complete while you work elsewhere. An agent run isn't a persistent conversation tab. If you want to follow its activity in the app, add `in a tab` to open a monitor tab for that run.

The `janus` command starts it with a shell tab. Type `shell` to open another shell tab, with a live zsh terminal and its own command bar; by default, its plain-text session transcript is kept separately in a file. Type `harness claude` to open Claude Code in a full-terminal tab. That terminal fills the tab, with no app command bar or in-tab transcript. You can also use `open`, `edit`, and `files` to view images, Markdown, code, and directory trees alongside your work. Each shell tab has its own command bar, while harness tabs take input directly in their terminal. The tab strip helps you see which tabs are busy or have unread output.

![The Janissary window on first launch: a single janus shell tab with its zsh terminal above the command bar.](/screenshots/app-overview.png)

Tabs give you separate places to work. [Groups](/user-documentation/getting-started/groups) keep related tabs together, [scheduling](/user-documentation/automation/scheduling) runs commands in a tab later, [send](/user-documentation/command-bar/send) delivers input to shell and harness tabs, and [profiles](/user-documentation/automation/profiles) recreate a multi-tab setup with one command. For an autonomous task, run `agent execute <task>` from a command bar; add `in a tab` when you also want a monitor tab. For work you'd rather keep at arm's length, a [workspaced tab](/user-documentation/advanced-agents/workspaced-agent) gets a disposable clone of your repository, isolated from the rest of your machine.

If you're new, start with [Starting the app](/user-documentation/getting-started/startup), then read [Tabs](/user-documentation/getting-started/tabs) — the rest of the docs assume both.
