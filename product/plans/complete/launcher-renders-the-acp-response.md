# Show a core ACP answer the launcher's own bar asked for

**Complexity: 5/10** — one published hook the launcher was not reading, one wrapper, and two tests that need a response scope the existing suite never mounted.

The launcher hosts the application's own command bar, so any line can be typed into it — including `acp <prompt>`, which `src/commands/acp.ts` marks as a core response and which the host renders on the tab's own ACP surface. `useLauncherSubmit` deliberately shows nothing for a `coreResponse` reply, because the answer would otherwise appear twice. That is right, and it leaves the other half undone: `LauncherTab` never reads `useAcpResponse`, so the host's surface is never mounted for this tab. A user who asks a provider something from the rail sees nothing at all — no streamed answer, no **Reset ACP** control, no tool steps. They cannot stop a request they started.

`src/plugins/PluginBody.tsx` already supplies the response scope to every plugin body; the launcher is the only one that does not render it. `ShellTab.tsx` is the shape to follow.

## Goal

A line the launcher's bar sends to the core ACP session is answered in the host's own surface, with the controls that surface carries.

## Approach

1. **`web/src/plugins/launcher/LauncherTab.tsx`** reads `useAcpResponse` and renders the node between the rail's own reply area and the command bar that asked for it, in a scrollable panel. The shell places it in the same slot.
2. Nothing changes in `useLauncherSubmit`: a `coreResponse` reply still contributes no text of its own, which is what makes the two surfaces one answer rather than two.
3. **The one open question the entry names — how the summarizer's automatic turns appear — is decided by leaving them visible.** The summarizer runs on this tab's own connection, so its turns are this session's turns, and the host's surface is the session rather than one conversation inside it. Filtering machine turns out of it would need the host to mark which entries a user asked for, which is a change on the other side of the capability boundary for no gain the rail needs.

### Rejected alternatives

- Rendering the panel only when the launcher itself dispatched an ACP line. The host's surface is bound to the tab's scope and always renders its node; hiding it would mean not rendering a node the host supplied, and the user would lose the Reset control on a session they can already see running.
- Duplicating the streamed text into the rail's own reply area. That is the double answer the `coreResponse` flag exists to prevent.
- Moving the summarizer onto its own connection so the panel is user-only. That is a design change to where the summarizer runs, recorded as a separate question, and the summarizer's tab is the one connection a summary can use.

## Implementation steps

1. Read `useAcpResponse` in `LauncherTab` and render it.
2. Add its rule to `launcher.css`.
3. Extend `LauncherTab.test.tsx` with a populated response scope.
4. Run `./scripts/run.mjs check-diff`.

## Tests

- `web/src/plugins/launcher/LauncherTab.test.tsx`: with the host's response scope populated and running, a line dispatched through the bar renders the streamed answer and the **Reset ACP** control, and the rail's own reply area stays empty — the host's surface is the answer, not a second copy of it.
- A rail row whose reply is not a core response still shows its own text, which is the case the existing flag handling covers.

## Spec updates

- `product/specs/launcher.md`: the command bar section says a line dispatched to the core ACP session is answered in the host's own response surface above the bar, carrying that surface's controls, and that the same surface also shows the summarizer's turns because they run on this tab's connection.

## Out of scope

- A tool-step summary or a word count in the panel's header. The host owns that surface.
- Changing where the summarizer runs.
