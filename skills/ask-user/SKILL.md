---
name: ask-user
description: Ask the human running Janissary for free text or a choice from an ACP agent. Use `question ask` when work needs missing information and `question approve` when the human must select one of several explicit options.
---

# Ask the user

Issue one question command on the final line of your reply. Janissary waits for the human and returns the answer as command output in your next turn.

## Collect free text

```text
question ask "What port should the service use?"
```

Quote the question. Do not put the command in a code fence or add text after it.

## Offer choices

```text
question approve "Deploy to production?" Yes No "Not yet"
```

Quote any option label containing spaces. The command output is the selected label exactly as supplied.

## Handle cancellation

Cancellation or tab closure returns `Question cancelled.`. Decide how to proceed from that output or ask a different question. Malformed commands return usage text without opening a panel.
