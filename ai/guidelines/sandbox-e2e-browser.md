# The Sandboxed E2E Browser

You are reading this because you may be running inside a janissary workspace with a browser attached. This is the operating manual for using it.

Inside a workspace you **cannot launch your own browser**. Playwright keeps its Chromium under `$HOME`, which the sandbox denies reading, so `chromium.launch()` fails on a permission error. That is the sandbox working as designed, not a bug to route around — do not go looking for another copy of Chromium, and do not try to install one. When a browser is available to you, janissary has already started it and handed you the way in.

## Telling whether you have one

Two environment variables, both set only when the tab was launched with `-b`/`--browser`:

| Variable | What it is |
| --- | --- |
| `JANISSARY_BROWSER_WS_ENDPOINT` | The websocket endpoint to connect a Playwright client to. |
| `JANISSARY_PLAYWRIGHT` | The path to janissary's own Playwright client entry point. |

If they are unset, you have no browser and no way to get one. Say so rather than working around it; the human can relaunch the tab with `-b`.

## Connecting

Import the client from `JANISSARY_PLAYWRIGHT`, **not** from the project's own `node_modules`. Playwright's client and server must be the same version to connect at all, and a fresh workspace clone has no `node_modules` until you install them. Run your script under `JANISSARY_NODE`, which names a known-good node binary — a bare `node` on the sandboxed `PATH` does not always resolve to one.

The package is CommonJS, so a dynamic `import()` puts it under `.default`:

```js
const { chromium } = (await import(process.env.JANISSARY_PLAYWRIGHT)).default;

const browser = await chromium.connect(process.env.JANISSARY_BROWSER_WS_ENDPOINT);
const page = await browser.newPage();
```

`createRequire` works too, and reads more plainly if you prefer it:

```js
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.JANISSARY_PLAYWRIGHT);
```

It is `chromium.connect(endpoint)`, not `connectOverCDP`. The endpoint speaks Playwright's own protocol.

**Retry once on the first connect.** The endpoint is handed to you before the browser has finished starting, deliberately: nothing about your tab waits on Chromium. A script that connects in the first fraction of a second may need a second attempt a moment later. One retry is enough; a failure that persists means something else.

## What to point it at

**Your own server, which you start yourself.** Install the workspace clone's dependencies, start its build inside the sandbox, read the URL and token out of that server's own output, and navigate there. The browser runs on the same host as your server in both the local and remote case, so a `127.0.0.1` URL resolves either way.

Janissary deliberately gives you no URL and no session token for the janissary window the human is working in. That is not an oversight and there is no other route to it: driving the human's own window would create, focus, and close real tabs in the session they are using, and your clone renders the same UI anyway. Test the code you changed, not the code they are running.

## What will end your session

The endpoint you hold belongs to a guard that filters the protocol, not directly to the browser. It will close your connection outright — not fail one call — when:

- **You navigate to a `file:` URL.** Any `file:` URL, anywhere in a frame you send. This is on purpose: an endpoint that could read `file:///Users/…/.ssh/id_rsa` would be a way out of the sandbox. Do not try to reach the filesystem through the browser, and do not treat the closed session as a transient error to retry through. Read files with your ordinary tools instead — you already have workspace access.
- **You send a frame the guard cannot parse.** Every frame is decoded as UTF-8 and parsed as JSON; one that will not parse ends the session the same way a blocked URL does.

There is no partial result to salvage from either case, and reconnecting to retry the same navigation will end the new session the same way.

## When it stops working

**A connect that used to work now fails.** The browser is most likely gone — it crashed, or was killed. There is no supervisor and nothing restarts it. The human's notifications tab will have a line saying so. You cannot bring it back; report it rather than retrying in a loop.

**The first connect never works at all.** Beyond the one retry above, this usually means the browser never came up. The likeliest cause is that another process on the host took one of the two ports the launch had chosen, in the moment between choosing it and binding it — janissary keeps its own launches from colliding with each other, but it cannot reserve a port against the rest of the machine. The notifications tab will have the line. Nothing is left running and nothing retries; report it rather than looping.

**`-b` together with `--offline`.** These two are contradictory and janissary does not reject the pair. `--offline` denies your process the network, which includes the route to your own browser, so both variables are set and `connect()` times out with nothing wrong. If you see that exact combination in your tab's launch, this is the explanation — it is expected, not a fault to debug.

## What this is not

There is no test runner, no assertion helper, and no pass/fail reporting anywhere in this feature. The two variables are the entire surface. Write your own script, drive your own page, and decide for yourself what passing means.
