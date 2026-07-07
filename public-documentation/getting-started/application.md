# What is Janissary?

<img class="agent-float" src="/agents/fariz-south.png" alt="" />

Janissary is a shell for running several things at once — commands, AI coding agents, file viewers — each in its own tab of a single app window. You type at one command bar; what you type can be an application command, a shell command, or a prompt to an agent, and the app works out which you meant.

The `janus` command starts it. A session begins as a single tab and grows as you need it to: `agent` opens a fresh agent tab with its own transcript, shell, and working directory; `harness claude` puts a full AI coding harness in a tab; `open`, `edit`, and `files` open viewers for images, Markdown, code, and directory trees. Tabs stay independent — a long build in one tab doesn't block a conversation with an agent in another — and the tab strip shows at a glance which agents are busy and which have new output waiting.

![The Janissary window on first launch: a single janus tab above an empty transcript and the command bar.](/screenshots/app-overview.png)

That tab model is the core idea. Everything else builds on it: [groups](/getting-started/groups) keep related tabs together, [scheduling](/automation/scheduling) runs commands in a tab later, agents [message each other](/getting-started/tabs) across tabs, and [profiles](/automation/profiles) recreate a whole multi-tab setup with one command. For work you'd rather keep at arm's length, a [workspaced agent](/advanced-agents/workspaced-agent) gets a disposable clone of your repository, isolated from the rest of your machine.

If you're new, start with [Starting the app](/getting-started/startup), then read [Tabs](/getting-started/tabs) — the rest of the docs assume both.
