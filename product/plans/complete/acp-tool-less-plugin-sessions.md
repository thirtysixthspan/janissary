# Tool-less ACP sessions for a plugin's own tab

**Complexity: 5/10** — one additive request field on a published capability, one per-tab record plus one enforcement point in the ACP manager, and one call-site change. The work is in proving the enforcement rather than in writing it.

The launcher's summarizer runs on the launcher tab's own core ACP connection, and `product/specs/launcher.md` promises that session "may read, and it may not act". Nothing enforces it: `AcpManager.run` in `src/acp/manager.ts` always builds the full tool table from `createAcpToolTable` — browser, question, and database — and hands the loop a primer describing all three plus a runner and an extractor that can dispatch any of them. A summary prompt carries whole transcript tails, so a reply that emits `browser open`, `question ask`, or any database line executes host work from an automatic background flush. The plan's own justification for the design ("The session is tool-less by construction: `connectAcp` denies every permission request a caller has not opted into") is about ACP-level permissions, not about the host's own tool loop, and the tool loop is where the three host tools live.

## Goal

A plugin's own ACP session can be started without a tool table at all, and a summarizer's session is. A reply that emits a recognized browser, question, or database command then has no tool to run it and no extractor that recognizes it, while an ordinary `acp <prompt>` keeps every tool it has today.

## Approach

1. **`src/plugins/api.ts`** widens `startAcp` to take an optional request: `startAcp(request?: { withoutTools?: true })`. The field is additive, the option object has exactly one member, and it grants nothing an ordinary caller did not already have — a tool-less loop is a strictly smaller one — so it needs no new capability name and no API integer bump.
2. **`src/plugins/acp-capabilities.ts`** forwards the request to `managers.acp.start`, still resolving the answering label first. A plugin that omits it changes nothing.
3. **`src/acp/manager.ts`** records the policy on the owning tab's runtime when `start` is handed `{ withoutTools: true }`, and reads it the same way in `run`, before the tool table is built. It is the tab's own field rather than a manager-owned collection: a session that dies is replaced by one held to the same rule, and the tab record is what goes away with the tab, so a recycled label starts on the ordinary policy with no second collection to keep in step.
4. **`src/plugins/launcher/summarizer.ts`** requests the tool-less session on every flush's start. The summarizer is the only caller that asks.

### Rejected alternatives

- A declared `acpWithoutTools` capability name. It would be the only name in `TabPluginCapabilityName` that is not a function on the capability object, which forces the published contract's capability list to document a declaration as though it were callable; and it grants nothing, since a tool-less session is less privileged than the one the caller already has.
- Enforcing inside `runAcpToolLoop` by passing a null tool set there. The loop is shared with every other consumer and would then need to know about a mode only one manager decides.
- Stripping tool-shaped lines out of the summarizer's prompt instead. That argues with the symptom: a reply is the model's, not the host's to sanitize.

## Implementation steps

1. Widen `startAcp` in `src/plugins/api.ts`.
2. Forward the request in `src/plugins/acp-capabilities.ts`.
3. Add the per-tab field on `TabRuntime`, record it through the owning tab and read it in `run`, in `src/acp/manager.ts`.
4. Request it in `src/plugins/launcher/summarizer.ts`.
5. Update the tests below and run `./scripts/run.mjs check-diff`.

## Tests

- `src/acp/manager.test.ts`: a tool-less start followed by a run asserts the loop receives a primer holding only the Markdown instruction, that the extractor recognizes no command line for any of the three grammars, and that the runner refuses rather than dispatching. An ordinary start on the same setup still receives the full table.
- `src/acp/manager.test.ts`: the restriction is the tab's own field, so a closed-and-replaced session is still held to it, and a tab record recreated under the same label starts on the ordinary policy.
- `src/acp/plugin-session.test.ts` (host level, real loop): start tool-less through the plugin capability object and prompt a reply whose last line is `browser open https://example.com`; assert the prompt resolves with the reply and that neither the browser, the question registrar, nor the database was touched. The contrast case — the same reply with the ordinary capability object — does reach the browser, which is what makes the first assertion a regression test rather than a tautology.
- `src/plugins/launcher/summarizer.test.ts`: the stub records the request, and a flush asserts it asked for the tool-less session.

## Spec updates

- `product/specs/acp.md`: `startAcp` takes an optional tool-less request, and the tool loop's section records that a session started that way builds no tool table.
- `product/specs/launcher.md`: the summary section states the summarizer's session runs without tools, so a reply cannot invoke one.
- `documentation/developer-documentation/tab-plugins.md`: the `startAcp` bullet and the "Using core ACP" section describe the request.

## Out of scope

- Any change to what the ordinary `acp` command, the shell tab, or the monitor/conversation/editor consumers can run.
- A refusal message shown to a user who typed a command into a tool-less tab's own bar; the line is simply not extracted, exactly as any non-command line is today.
