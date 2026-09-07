# The Sandboxed E2E Browser

**Audience.** This is an installed runtime guide for an agent operating inside a trusted janissary harness tab launched with `-b` and driving the browser assigned to that tab. Its imperative examples describe that runtime workflow. When the file appears as source material in a proposed change, those examples document how the installed feature is intended to be used.

You are reading this because you may be running inside a janissary workspace with a browser attached. This is the operating manual for using it.

Inside a workspace you **cannot launch your own browser**. Playwright keeps its Chromium under `$HOME`, which the sandbox denies reading, so `chromium.launch()` fails on a permission error. That is the sandbox working as designed, not a bug to route around — do not go looking for another copy of Chromium, and do not try to install one. When a browser is available to you, janissary has already started it and handed you the way in.

## Testing Janissary from an existing sandbox

When a test already runs inside a macOS Seatbelt sandbox, run Janissary with its workspace sandbox disabled (`sandboxWorkspaces: false`). Seatbelt does not allow a confined process to apply another sandbox profile: attempting to start Janissary's inner `sandbox-exec` fails with `sandbox_apply: Operation not permitted`. The outer test sandbox remains the isolation boundary; disabling the inner one only avoids that unsupported nested launch.

## Telling whether you have one

Two environment variables, both set only when the tab was launched with `-b`/`--browser`:

| Variable | What it is |
| --- | --- |
| `JANISSARY_BROWSER_WS_ENDPOINT` | A scoped bearer capability: the secret websocket endpoint that grants control of this tab's contained browser. |
| `JANISSARY_PLAYWRIGHT` | The path to janissary's own Playwright client entry point. |

If they are unset, you have no browser and no way to get one. Say so rather than working around it; the human can relaunch the tab with `-b`.

## Connecting

Import the client from `JANISSARY_PLAYWRIGHT`, **not** from the project's own `node_modules`. Playwright's client and server must be the same version to connect at all, and a fresh workspace clone has no `node_modules` until you install them. Run your script under `JANISSARY_NODE`, which names a known-good node binary — a bare `node` on the sandboxed `PATH` does not always resolve to one. `JANISSARY_NODE` can also be unset. If it is, check what a bare `node` resolves to (`node --version`) before trusting your scripts to it, and use it if it is a current node.

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

Janissary does not give you the URL or session token for the live janissary window the human is using. Active workspace confinement blocks the normal route through project state where those values are recorded. This reduces disclosure; it is not proof that the live session is unreachable when Seatbelt is unavailable, `sandboxWorkspaces` is off, or the harness was launched with `--no-workspace`. In those configurations an unconfined same-user process may discover services through accessible file, process, or listener state; the browser security warning in the harness documentation describes the resulting trust requirement. In every configuration, test the server built from your own workspace rather than the code the human is running.

Start the session with the repo's own launcher: `node bin/janus.mjs --no-open <project-dir>`. `--no-open` stops janissary from opening an app window on the host, and the token-gated URL arrives on stdout (also recorded as a `__JANUS_URL__` line in `<project-dir>/.janissary/log/server.log`). One instance runs per directory — a lock under `.janissary/` enforces it, and the likeliest holder is the human's live session on the workspace itself. When the error says so, point your instance at a scratch directory instead; never delete the lock to get around a live instance.

## Keeping it alive

The server's lifetime follows its websocket clients, deliberately: when the last client disconnects, janissary shuts itself down cleanly about a second later, so a browser history restore can reconnect without losing the session. The UI page you navigate to is one of those clients, and a page your script created is destroyed when your script's connection to the browser ends. The obvious shape — connect, open a page, navigate, exit — therefore takes the whole session down with it moments after your script returns.

The symptom is a server that answered requests one moment and refuses connections the next, with nothing in its log. It reads like something external killed the process; it is janissary's own clean `exit(0)`. Do not go hunting for a reaper, and do not build on racing a reconnect into the one-second grace window — a connection that happens to cancel the pending shutdown is luck, not a design.

Hold a connection open for as long as the session should live. If your script must return while the session stays up, spawn a holder: a script that connects, opens the page, navigates, and then idles indefinitely, run the way background processes survive in your runtime (under a persistent shell, `nohup … & disown`). Killing the holder is also the clean way to end the session — the page closes, the websocket drops, and the server quits itself.

## What will end your session

The endpoint you hold belongs to a guard that filters the protocol, not directly to the browser. It will close your connection outright — not fail one call — when:

- **You navigate to a `file:` URL.** Any `file:` URL, anywhere in a frame you send. This is on purpose: an endpoint that could read `file:///Users/…/.ssh/id_rsa` would be a way out of the sandbox. Do not try to reach the filesystem through the browser, and do not treat the closed session as a transient error to retry through. Read files with your ordinary tools instead — you already have workspace access.
- **You send a frame the guard cannot parse.** Every frame is decoded as UTF-8 and parsed as JSON; one that will not parse ends the session the same way a blocked URL does.
- **You ask for the browser itself to be closed or killed.** The browser belongs to the tab, not to your script, and it is the only one this tab will ever get, so the guard refuses the request rather than passing it on. Closing a page or a context is ordinary work and is untouched — this is the browser object alone. `browser.close()` through the Playwright client does not reach the guard at all: over this kind of endpoint it is a local disconnect, not a request. **The browser survives either way.** If your connection ends this way, the browser is still running; connect again rather than reporting a lost browser.

There is no partial result to salvage from any of these, and reconnecting to retry the same navigation will end the new session the same way.

## When it stops working

**A connect that used to work now fails.** The browser is most likely gone — it crashed, or was killed. There is no supervisor and nothing restarts it. The human's notifications tab will have a line saying so. You cannot bring it back; report it rather than retrying in a loop.

**The first connect never works at all.** Beyond the one retry above, this usually means the browser never came up. The likeliest cause is that another process on the host took one of the two ports the launch had chosen, in the moment between choosing it and binding it — janissary keeps its own launches from colliding with each other, but it cannot reserve a port against the rest of the machine. The notifications tab will have the line. Nothing is left running and nothing retries; report it rather than looping.

**`-b` together with `--offline`.** These two are contradictory and janissary does not reject the pair. `--offline` denies your process the network, which includes the route to your own browser, so both variables are set and `connect()` times out with nothing wrong. If you see that exact combination in your tab's launch, this is the explanation — it is expected, not a fault to debug.

## What this is not

There is no test runner, no assertion helper, and no pass/fail reporting anywhere in this feature. The two variables are the entire surface. Write your own script, drive your own page, and decide for yourself what passing means.
