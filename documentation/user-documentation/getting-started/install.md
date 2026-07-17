# Installing

## Prerequisites

Before installing Janissary, make sure you have:

- **macOS.** - currently runs on macOS only.
- **Node.js 24 or newer.** - preferably managed by NVM.
- **Google Chrome.** - the UI is a dedicated browser window.
- **OpenCode** - AI Harness and ACP interface.
- **Claude Code** - AI Harness.
- **OpenAI Codex** - AI Harness.

## Installing the app

```
npm install -g --allow-scripts=janissary,node-pty,fsevents janissary
```

npm 12+ blocks install scripts from dependencies by default. `janissary` and its native dependencies (`node-pty`, `fsevents`) need their `postinstall` scripts to run — they fix native binary permissions after install — so `--allow-scripts` allows them explicitly.

## Installing the browser automation engine

The `browser` command drives a real Chromium browser to fetch and interact with web pages. It needs its own Chromium install, separate from the app window browser above. Install it once with:

```
npx playwright install chromium
```

If you skip this step, the `browser` command fails the first time you use it — run the command above and try again.

## Next steps

Once these are in place, continue to [Starting the app](/user-documentation/getting-started/startup).
