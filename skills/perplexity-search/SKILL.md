---
name: perplexity-search
description: >
  Search Perplexity AI via the browser, read the results, and summarize them.
  Handles sign-up walls, blank results, and common pitfalls. Designed for the
  Janissary host CLI with `browser` commands.
---

## Overview

Perplexity AI returns AI-generated answers with cited sources. Results are
rendered as plain text which the `browser content` command returns.

The host CLI provides four browser commands:

- `browser open <name>` — open a new browser window with a name (letters, numbers, `-`, `_` only)
- `browser goto <url>` — navigate to a URL
- `browser content` — return the page's rendered text
- `browser eval <js>` — run JavaScript in the page

End every message with **exactly one** command on its own final line. The host
executes it automatically and returns output. When done, reply with the final
answer and no trailing command.

## Workflow

### 0. Open a named browser window

Open a fresh browser window with a random 3-digit number as its name:

```text
browser open 473
```

Use a different random 3-digit number each time to avoid naming conflicts.
Names use letters, numbers, `-` and `_` only.

### 1. Navigate with query in URL

```text
browser goto https://www.perplexity.ai/search?q=<url-encoded-query>
```

Replace `<url-encoded-query>` with the search terms: spaces become `+`,
special characters become `%XX`.

### 2. Read the page

```text
browser content
```

The output contains the full rendered text of the Perplexity answer.

### 3. Handle common pitfalls

**Login/sign-up wall appears:**

Try appending `&nosignup=1` to the URL, or re-navigate with a slightly
different query. Sometimes the first navigation works but subsequent ones
trigger the wall.

**"Ask a follow-up" instead of an answer:**

The search did not trigger. Try:

1. Re-navigate with a more specific query.
2. Evaluate JS to focus the input, clear it, type the query, and submit:

```text
browser eval document.querySelector('[contenteditable]')?.focus()
browser eval <simple-js-without-double-quotes>
```

Note: complex JS strings with double quotes may be returned as-is without
executing. Prefer single-word or backtick-delimited eval expressions.

**Blank page or no results:**

Wait a moment and re-read content. If still blank, navigate again.

### 4. Summarize

Once `browser content` returns meaningful text, extract:

- **Core answer** — the main AI response paragraph(s)
- **Listed items** — any bullet lists, tables, or named entries
- **Number of sources** — look for "X sources" near the bottom
- **Follow-up questions** — listed after the answer
- **News headlines** — if present, often under "See more news"

## Example: successful search

```text
browser goto https://www.perplexity.ai/search?q=australian+survivor+contestants+season+6
browser content
```

Returns: 14 contestant names, "10 sources", 5 follow-up questions.

## Example: login wall

```text
browser goto https://www.perplexity.ai/search?q=australian+survivor+contestants+season+6
browser content
```

Shows sign-up wall. Re-try:

```text
browser goto https://www.perplexity.ai/search?q=australian+survivor+contestants+season+6&nosignup=1
browser content
```
