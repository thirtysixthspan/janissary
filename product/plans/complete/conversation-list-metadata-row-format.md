# Fix: format the conversation-list metadata row like the agent and harness rows

**Complexity: 2/10** — the change is confined to the chat plugin's own stylesheet and a colocated stylesheet test. No component, server, protocol, or plugin-contract work is involved.

## Goal

Make the conversation list's metadata row read exactly like the metadata row of the agent, harness, and file-navigator tabs: a full-width band of muted 12-point text with the action icons at the right edge and a rule beneath it, and icon buttons that carry the host's borderless, transparent, muted-until-hover treatment.

## Approach

The label and the button placement were already corrected: the row carries no title and holds an icon-only **New conversation** action beside the split action. What is still wrong is the formatting, and both defects live in CSS.

The row uses the padded plugin frame (`plugin-tab` and `plugin-meta`), which centres the row inside the body's own padding and gives it no rule, no reduced text size, and no full-width band — unlike `tab-meta` on the agent and harness tabs or `files-header` on the file navigator. The conversation list frames itself like those host tabs instead: the frame drops its padding and gap, the header takes the host row's `6px 12px` padding, 12-point type, and bottom rule, and the rows and empty message take back the padding the frame gave up.

The action buttons carry no class at all, so they render with the browser's default button chrome — a border, a background, and the platform font — beside the host's borderless split icon. A rule for the buttons in both chat metadata rows gives them the same treatment `tab-open-files`, `tab-split`, and `files-new-file` share, including the dimmed look the conversation tab's disabled controls need.

The stylesheet also names two custom properties the application never defines — `--selection` for the row and query-bubble backgrounds and `--red` for failed and deleted text — so those declarations render as nothing. Both are replaced with the defined `--bg-soft` and `--error` in the same pass, since they are the same defect in the same stylesheet.

## Implementation steps

1. Update `web/src/plugins/chat/chat.css` so the conversation list frames itself like the host tab bodies, its metadata row carries the host row's padding, type size, and bottom rule, and the metadata action buttons in both chat rows carry the host's icon-button treatment. Replace the undefined `--selection` and `--red` tokens with `--bg-soft` and `--error`.
2. Run `./scripts/run.mjs check-diff` and resolve any failures.
3. Add `web/src/plugins/chat/chat-style.test.ts` covering the metadata-row and action-button rules in the style of `web/src/theme.test.ts`.
4. Run `./scripts/run.mjs check-diff` and resolve any failures.
5. Update `product/specs/conversations.md` to describe the metadata row's shared formatting.
6. Check `help.md` and `documentation/user-documentation/` for existing conversation-list header guidance, update it only if present, then run `./scripts/run.mjs check-diff`.

## Tests

- The conversation list frame drops the plugin frame's padding and gap so its metadata row spans the full width.
- The conversation-list metadata row carries the host metadata row's padding, 12-point type, and bottom rule.
- Metadata action buttons in both chat rows are borderless and transparent, muted until hover, and dimmed when disabled.
- The stylesheet references only custom properties the application theme defines.

## Out of scope

- Conversation row selection, navigation, and opening behavior.
- The conversation tab's own frame, model selector, and composer.
- Metadata-row styling in host tabs or in any other plugin.
- Server intents, conversation persistence, and plugin API changes.

## Verification

- `./scripts/run.mjs check-diff` passes after implementation, tests, and spec updates.
- PR #952 remains open and receives the completed commit on `feature/conversations-plugin`.
