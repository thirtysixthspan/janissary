# Frame every model-fed tab string as data in the summarizer prompt

**Complexity: 4/10** — one prompt rewiring inside `describeTab`, one validation the marker line needs, one delimiter source swap, and tests that assert position rather than content.

`describeTab` in `src/plugins/launcher/summarizer.ts` wraps only the transcript tail between the session's markers. A tab's display name and its last command line are interpolated straight into the instruction-bearing part of the prompt, where the trust framing does not reach them: `named ${tab.title}` and `Last command: ${tab.lastCommand}` are both arbitrary text, a display name because `renameTabOp` assigns whatever the user types, and a command line because it is whatever the tab last ran. Both are exactly the indirect-prompt-injection route the framing exists to close.

The marker line has the same hole one layer down. A label is also arbitrary text — an explicit `zsh <name>` is accepted with no character check — and the label is what the marker carries outside the framing. A label holding the marker's own syntax, or a line break, writes into the instruction-bearing part too.

The delimiter is a third, smaller instance of the same weakness: it is `Math.random()` plus `Date.now()`, which is guessable in principle, where `src/monitor/framing.ts` — the shape this copies — uses `randomUUID()`.

## Goal

Every string a tab supplies reaches the model only between the session's markers, and what sits outside them is the routing identity the reply is keyed on plus the flags the host itself measured. A label that cannot serve as a routing identity is not fed at all.

## Approach

1. **`src/plugins/launcher/summarizer.ts`** rewires `describeTab`. The marker line keeps the label and the flag facts — view, busy, needs-input, unread — and everything a third party can write into moves inside the markers: the display name when there is one, the last command line, and the transcript tail. The framing text names all three, so the priming describes what is actually delimited.
2. The same module gains the routing-identity check: a label is routable when it is non-empty and holds neither the marker's open or close syntax nor a line break. `buildSummarizerPrompt` drops a tab whose label is not, because a marker the model could not reproduce is not a key. Tabs keep every other behaviour; only the prompt changes.
3. The delimiter becomes `janus-launcher-${randomUUID()}`, the monitor's source and shape, so a transcript author cannot derive one.

### Rejected alternatives

- Escaping the label into the marker instead of dropping the tab. The reply is keyed on the label, so an escape would have to be undone on both sides of the round trip for a tab the pool almost never names this way.
- Moving the label inside the markers and keying the reply on a positional index. It reaches `state.summaries`, the payload's key, and every client row that matches a summary to its tab, which is a change to the feature's data shape rather than to its prompt.
- Prefixing every framed string with a per-line marker. A spoofable marker is what the per-session delimiter already replaced.

## Implementation steps

1. Add the routing-identity predicate and point `buildSummarizerPrompt` at it.
2. Rewire `describeTab` so the display name, last command, and tail are all inside the markers.
3. Swap the delimiter to `randomUUID()` and widen the framing text to name what it delimits.
4. Update the tests below and run `./scripts/run.mjs check-diff`.

## Tests

- `src/plugins/launcher/summarizer.test.ts`: a display name and a last command that both try to end the block and reissue instructions are asserted to lie between the markers — the reply-format line they carry is after the opening delimiter and before the closing one, and the marker line's own facts stay outside.
- A multiline display name and a multiline command line land inside the markers with their line breaks intact, so no framed line escapes the block.
- A tab whose label carries `]]`, the marker's open syntax, or a line break is not described, while its flags are still absent from the prompt rather than partially rendered.
- The delimiter carries a fresh UUID, so two sessions never share one and its shape is the monitor's.
- The existing cases keep their meaning: the label and the flags stay outside the markers, an empty list still asks nothing, and a reply naming a closed tab is still dropped.

## Spec updates

- `product/specs/launcher.md`: the summary section states that a tab's name, last command, and transcript slice are all framed as data, that only the label and host-measured flags sit outside the framing, and that this is a boundary the summarizer is additionally held to by its tool-less session rather than a guarantee that injection is impossible.

## Out of scope

- Sanitizing what a tab's transcript contains, or what a command it ran produced. Both are data, and both are now inside the markers.
- Validating an explicit tab name at launch. The label check here is the summarizer's own contract; a general naming rule is a separate change.
