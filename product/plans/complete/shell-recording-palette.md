# Forward the terminal palette through `reportTerminalColors`

Recording a shell tab was meant to capture the theme the session actually ran under, and the asciicast header carries `term.theme.palette` for exactly that. Every other link in the chain was already in place — the client reads the theme's sixteen `--terminal-*` custom properties, `TerminalColors` types them, `isTerminalColors` validates them when present, `isPalette` insists on exactly sixteen plain colours, and `castHeader` writes the list. The one link missing was the hop through the server's message handler, which meant no shell recording had ever carried a palette, and each one replayed against the default sixteen colours whatever theme produced it.

## The defect

`reportTerminalColors` is validated at ingress rather than forwarded, because its strings are written into a recording header and handed to a terminal emulator, and none of them has any business being anything but a plain colour. The handler destructured only the two colours it had been written for:

```ts
const { id, fg, bg } = message.params;
if (isTerminalColors({ fg, bg })) controller.reportTerminalColors(id, { fg, bg });
```

Adding `palette` to the message, the type, and the recorder header left this line untouched, so the field was dropped on the way to the controller. The result was invisible at every layer that mattered: the validator accepted the palette, the header code would have written it, and nothing complained, because nothing ever received one.

## The fix

Forward the palette through the same ingress check as the two colours. `isTerminalColors` treats an absent palette as valid, so a client with no palette to report simply sends none and needs no separate path:

```ts
const { id, fg, bg, palette } = message.params;
if (isTerminalColors({ fg, bg, palette })) controller.reportTerminalColors(id, { fg, bg, palette });
```

Because the pair and the palette now travel as one value through one validator, a palette of the wrong length or a list holding something other than a colour is refused at the same moment the colours are, and no recording is written with a header that disagrees with its own contents.

## Verification

A regression test covers the forwarded palette alongside the existing ingress cases: a sixteen-entry palette reaches the controller intact, and a palette of fifteen entries, a list holding `linear-gradient(red, blue)`, and a bare colour string where a list belongs are each dropped rather than written into a header.

`check-diff` passes. In a browser, a shell tab's written header is compared entry by entry against the theme's own computed custom properties: `fg`, `bg`, and all sixteen palette entries match, where before the palette was absent and the header carried only the two colours.