# What is Janissary?

<img class="agent-float" src="/agents/ahmed-south-east.png" alt="" />
<img class="agent-float left" src="/agents/aslan-south-west.png" alt="" />

Janissary is an **Agentic Working Environment**: an app for directing AI agents rather than typing every command yourself. The core interaction is the agent — you open one, give it a task, and it works in its own space while you move on to something else. Each agent communicates through a **tab**: a text-based transcript where you send it commands or prompts and read what it does in return.

The `janus` command starts it. A session begins as a single tab and grows as you need it to: `agent` opens a fresh agent tab with its own transcript, shell, and working directory; `harness claude` puts a full AI coding harness in a tab; `open`, `edit`, and `files` open viewers for images, Markdown, code, and directory trees alongside your agents. You type at one command bar; what you type can be an application command, a shell command, or a prompt to an agent, and the app works out which you meant. Tabs stay independent — a long build in one tab doesn't block a conversation with an agent in another — and the tab strip shows at a glance which agents are busy and which have new output waiting.

![The Janissary window on first launch: a single janus tab above an empty transcript and the command bar.](/screenshots/app-overview.png)

The tab is the core idea. Everything else builds on it: [groups](/user-documentation/getting-started/groups) keep related tabs together, [scheduling](/user-documentation/automation/scheduling) runs commands in a tab later, agents [message each other](/user-documentation/getting-started/tabs) across tabs, and [profiles](/user-documentation/automation/profiles) recreate a whole multi-tab setup with one command. For work you'd rather keep at arm's length, a [workspaced agent](/user-documentation/advanced-agents/workspaced-agent) gets a disposable clone of your repository, isolated from the rest of your machine.

If you're new, start with [Starting the app](/user-documentation/getting-started/startup), then read [Tabs](/user-documentation/getting-started/tabs) — the rest of the docs assume both.
