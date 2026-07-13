# Prerequisites

Before installing Janissary, make sure you have:

- **macOS.** Janissary currently runs on macOS only.
- **Node.js 24 or newer.**
- **A Chromium-based browser** — Google Chrome, Chromium, Microsoft Edge, or Brave. Janissary opens its UI in a dedicated app window hosted by whichever of these browsers it finds on your system. If none are installed, it falls back to opening in your default browser instead.

## Installing the browser automation engine

The `browser` command drives a real Chromium browser to fetch and interact with web pages. It needs its own Chromium install, separate from the app window browser above. Install it once with:

```
npx playwright install chromium
```

If you skip this step, the `browser` command fails the first time you use it — run the command above and try again.

## Next steps

Once these are in place, continue to [Starting the app](/user-documentation/getting-started/startup).
