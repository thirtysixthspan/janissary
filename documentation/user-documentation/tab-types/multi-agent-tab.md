# Multi-agent tab

Compare several models on the same prompt, each working in a throwaway copy of the repository, and read their answers side by side:

```
fanout opencode:google/gemini-3.1-flash-lite opencode:opencode/big-pickle what does this repository do?
```

Everything before the prompt is a **member**: `opencode:` followed by a model name. Everything after it is the one prompt every member receives. Model names are long and easy to mistype, so type `opencode:` and press <kbd>Tab</kbd> to complete one from the list.

The tab that opens is titled with the prompt, shows that prompt once at the top, and carries a row per member. A row reads what its member is doing — *cloning its workspace*, *working*, *answered*, *failed* — and then the answer itself, formatted as Markdown, once it lands. A line above the rows counts how many have answered.

Between one and eight members. Each one is a real copy of the repository, so a comparison of eight is a real cost in disk and time.

## What a member can do

An ordinary agent answers in prose and never touches your files — its tools are switched off. A comparison member is different: it is a working agent, free to read, change and run things, because that is the only way its answer is worth reading. Each member works in its own copy, and is kept inside it — so nothing it does reaches your actual checkout, and nothing one member does reaches another.

That confinement is also a requirement. If workspace isolation is switched off in your configuration, or unavailable on your machine, a member will not run and its row says so rather than an agent working unrestricted against your checkout.

A member's copy is a plain copy of the repository. Nothing installs the project's dependencies into it, so a member asked to run your tests cannot; its answer is reasoning about the code rather than evidence from running it.

## When a member does not run

A model name the catalog does not carry, or one you list twice, is refused: that row reads **failed** with the reason and the rest of the comparison carries on, because a comparison of eight where one model has been retired is still worth reading. If every member is refused, no tab opens and the command says why.

Closing the tab is the whole teardown — every member is stopped and every copy is removed. There is nothing to cancel and nothing to clean up afterwards.

## What it does not do

The tab lines answers up for you to read. It does not choose a winner, score them, or rank them; it does not compare two answers against each other; and it does not merge or diff what the members changed in their copies.

A comparison is one command, one prompt, one set of members. To ask something else, run `fanout` again — it opens a second tab with its own copies.

Nothing about a comparison survives a restart. Like a harness tab, it is live only for the session it was opened in.
