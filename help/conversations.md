### conversations

Open the conversation list, dock it to a sidebar, or open a saved conversation by title.

**Usage**

`conversations`

`conversations left`

`conversations right`

`conversations <title>`

**Use cases**

- Browse saved conversations.
- Keep the conversation list in a sidebar while working in another tab.
- Open a saved conversation by title, ignoring case.

**Examples**

- `conversations` opens the conversation list, or moves a docked list back to the center.
- `conversations right` docks the list on the right.
- `conversations Weekend plans` opens the saved conversation with that title. If none matches, it replies `No conversation matching "Weekend plans".`

The model selector offers enabled Claude and OpenCode models. If a conversation's saved model becomes disabled or leaves the catalog and another enabled choice exists, its next query uses the first enabled choice. If no enabled choice exists, the next query retains the saved pair. Creating a new conversation requires an enabled pair.
